/**
 * Google Drive sync: sign in with Google, and every saved invoice, client,
 * template and brand is kept in one file in the user's own Google Drive, so
 * they can sign in on any other device and carry on from there.
 *
 * How it works
 *  - The browser stays the working copy: the app keeps saving to
 *    localStorage exactly as before, and works offline.
 *  - A few seconds after a change, and when the page is opened, shown again
 *    or hidden, this module syncs: it reads the Drive file (only if another
 *    device changed it), merges (js/cloud/sync-merge.js), applies anything
 *    new to this browser and uploads the result.
 *  - Google access tokens last about an hour and, without a server, can only
 *    be renewed from a click. When one expires the app keeps working and
 *    saving locally, and the "Reconnect" button renews it; changes made in
 *    the meantime are uploaded then.
 *
 * Off unless a Google client ID is set in js/config.js.
 */

import { $, toast, toastError } from "../utils.js";
import { dateFmt } from "../invoice/formatters.js";
import { STORAGE_KEYS, APP_VERSION } from "../constants.js";
import { readJSON, writeJSON, onLocalWrite } from "../storage/local-storage.js";
import { syncConfigured, syncAvailableHere, loadGoogleScript, currentToken, forgetToken, requestToken } from "./google-auth.js";
import { getAccount, findSyncFile, readSyncFile, createSyncFile, updateSyncFile } from "./drive-api.js";
import { mergeForSync, listHash, normalizeClients, normalizeNamed } from "./sync-merge.js";
import { buildBackup, restoreBackup, inspectBackup, BACKUP_FORMAT } from "../storage/backup.js";
import {
  listInvoices, readRecord, loadSavedInvoice, deleteInvoiceRecord, readDeletedInvoices, writeDeletedInvoices
} from "../storage/invoice-library.js";
import { listClients, writeClients } from "../storage/client-book.js";
import { listTemplates, writeTemplates } from "../storage/template-library.js";
import { listBrands, writeBrands } from "../storage/brand-library.js";
import { flushInvoiceSave, clearInvoice } from "../storage/invoice-storage.js";
import { refreshKnownRecord } from "../storage/tab-sync.js";
import { state } from "../state.js";
import { applySnapshot } from "../session.js";
import { resetHistory } from "../history/invoice-history.js";
import { notifyDocumentsChanged, deleteInvoice, openInvoice } from "../documents.js";
import { refreshLibraries } from "../editor/library.js";
import { refreshClientPicker } from "../editor/clients.js";
import { confirmAction } from "../ui/confirm-dialog.js";

/** Upload this long after the last change... */
const PUSH_DELAY_MS = 6000;
/** ...but no later than this after the first unsynced change. */
const PUSH_MAX_WAIT_MS = 30000;
/** While the page is visible, look for changes from other devices this often. */
const PULL_INTERVAL_MS = 3 * 60 * 1000;
/** When the page is shown again, sync if the last sync is older than this. */
const STALE_AFTER_MS = 45 * 1000;

const LOCK_NAME = "sa-invoice-generator-drive-sync";

/* ------------------------------------------------------------- state */

/**
 * Sync settings for this browser (localStorage, never uploaded):
 *   email, name     the signed-in Google account ("" when signed out)
 *   lastEmail       the account this browser last synced with, kept after
 *                   signing out, to warn before mixing two people's invoices
 *   fileId, version the Drive file and the version this browser last saw
 *   base            list hashes after the last sync (see sync-merge.js)
 *   dirty           changes made here that are not in Drive yet
 *   lastSyncAt      ISO time of the last successful sync
 */
function readMeta() {
  const meta = readJSON(STORAGE_KEYS.cloudSync, {});
  return meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
}
const writeMeta = meta => writeJSON(STORAGE_KEYS.cloudSync, meta);
const updateMeta = patch => writeMeta({ ...readMeta(), ...patch });
const signedIn = () => Boolean(readMeta().email);

/** "idle" | "syncing" | "reconnect" | "error" | "offline" */
let status = "idle";
let statusDetail = "";
let syncing = false;
let syncAgain = false;
/** True while this module writes Drive changes into localStorage. */
let applying = false;
let pushTimer = null;
let firstPendingAt = 0;

const SYNCED_KEYS = new Set([
  STORAGE_KEYS.invoiceIndex, STORAGE_KEYS.logos, STORAGE_KEYS.clients,
  STORAGE_KEYS.templates, STORAGE_KEYS.brands, STORAGE_KEYS.deletedInvoices
]);
const isSyncedKey = key => SYNCED_KEYS.has(key) || String(key).startsWith(STORAGE_KEYS.invoiceRecordPrefix);

/* ----------------------------------------------------------------- UI */

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function ago(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return "at " + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return "on " + dateFmt(iso.slice(0, 10));
}

function setStatus(next, detail = "") {
  status = next;
  statusDetail = detail;
  render();
}

function render() {
  const panel = $("panel-cloud");
  if (!panel) return;
  const meta = readMeta();
  const isIn = Boolean(meta.email);
  $("cloudSignedOut").hidden = isIn;
  $("cloudSignedIn").hidden = !isIn;

  const chip = $("cloudChip");
  const chipText = $("cloudChipText");
  chip.hidden = !isIn;

  const notice = $("privacyNoticeText");
  if (notice) {
    notice.textContent = isIn
      ? "Saved in this browser and synced to your Google Drive."
      : "Saved only in this browser on this device. Nothing is uploaded.";
  }
  if (!isIn) {
    $("cloudHint").textContent = "Off";
    return;
  }

  $("cloudName").textContent = meta.name || meta.email;
  $("cloudEmail").textContent = meta.name ? meta.email : "";
  $("cloudAvatar").textContent = (meta.name || meta.email || "?").trim().charAt(0).toUpperCase();

  const last = meta.lastSyncAt ? "Last synced " + ago(meta.lastSyncAt) + "." : "Not synced yet.";
  const waiting = meta.dirty ? " Some changes are not in Drive yet." : "";
  let line;
  let chipLabel;
  if (status === "syncing") {
    line = "Syncing with Google Drive…";
    chipLabel = "Syncing…";
  } else if (status === "reconnect") {
    line = "Click Reconnect to sync with Google Drive (a Google sign-in lasts about an hour). Your work is still saved in this browser." + waiting;
    chipLabel = "Reconnect Drive";
  } else if (status === "offline") {
    line = "You are offline. Changes are saved in this browser and will sync when you are back online." + waiting;
    chipLabel = "Offline";
  } else if (status === "error") {
    line = statusDetail + " " + last + waiting;
    chipLabel = "Sync problem";
  } else {
    line = meta.dirty ? "Changes waiting to sync… " + last : last;
    chipLabel = meta.dirty ? "Syncing soon" : "Synced";
  }
  $("cloudStatus").textContent = line;
  $("cloudHint").textContent = status === "reconnect" ? "Reconnect needed" : status === "error" ? "Problem" : "On";
  chip.className = "save-state cloud-chip " + (status === "idle" && !meta.dirty ? "saved" : status === "idle" ? "pending" : status);
  chipText.textContent = chipLabel;
  chip.title = status === "reconnect"
    ? "Click to reconnect Google Drive (" + meta.email + ")"
    : "Google Drive sync (" + meta.email + "). " + line + " Click to sync now.";
  const reconnect = status === "reconnect";
  $("cloudSyncBtn").textContent = reconnect ? "Reconnect" : "Sync now";
  $("cloudSyncBtn").disabled = status === "syncing";
}

/* --------------------------------------------------------------- sync */

const withLock = fn => (navigator.locks?.request ? navigator.locks.request(LOCK_NAME, fn) : fn());

/**
 * Syncs now.
 * @param {{interactive?: boolean}} [options] interactive: called from a
 *        click, so an expired sign-in may be renewed (opens Google's window)
 * @returns {Promise<boolean>} whether the sync completed
 */
export async function syncNow({ interactive = false } = {}) {
  if (!signedIn()) return false;
  if (syncing) {
    syncAgain = true;
    return false;
  }
  let token = currentToken();
  if (!token) {
    if (!interactive) {
      setStatus("reconnect");
      return false;
    }
    try {
      token = await connect({ chooseAccount: false });
    } catch (err) {
      toastError(err.message);
      setStatus("reconnect");
      return false;
    }
    if (!token) return false;
  }
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    setStatus("offline");
    return false;
  }
  clearTimeout(pushTimer);
  pushTimer = null;
  firstPendingAt = 0;
  syncing = true;
  setStatus("syncing");
  let ok = false;
  try {
    const summary = await withLock(() => runSync(token));
    ok = true;
    setStatus("idle");
    if (summary && (interactive || summary.notice)) {
      if (summary.notice) toast(summary.notice);
      else if (interactive) toast("Synced with Google Drive.");
    }
  } catch (err) {
    console.error("[SA Invoice Generator] Google Drive sync failed:", err);
    updateMeta({ dirty: true });
    if (err.status === 401) {
      forgetToken();
      setStatus("reconnect");
    } else if (err.status === 0 && navigator.onLine === false) {
      setStatus("offline");
    } else {
      setStatus("error", err.message || "Sync failed.");
      if (interactive) toastError(err.message || "Sync failed.");
    }
  } finally {
    syncing = false;
    if (syncAgain) {
      syncAgain = false;
      schedulePush(1500);
    }
  }
  return ok;
}

/** The parts of a backup that matter for "is anything different?". */
const contentHash = doc => listHash([doc.invoices, doc.logos, doc.deleted || {}, doc.clients, doc.templates, doc.brands]);

async function runSync(token) {
  flushInvoiceSave();
  const meta = readMeta();
  const dirtyAtStart = Boolean(meta.dirty);
  // Changes made from here on mark the data dirty again.
  updateMeta({ dirty: false });

  const file = await findSyncFile(token, meta.fileId);
  const remoteUnchanged = Boolean(file && file.id === meta.fileId && meta.version && String(file.version) === String(meta.version));
  let remote = null;
  if (file && !remoteUnchanged) {
    remote = await readSyncFile(token, file.id);
    inspectBackup(remote); // throws if it is not a backup this app can read
  }

  if (file && remoteUnchanged && !dirtyAtStart) {
    updateMeta({ lastSyncAt: new Date().toISOString() });
    return null;
  }

  const local = { ...buildBackup(), deleted: readDeletedInvoices() };
  const result = mergeForSync(local, remote, meta.base || {});
  const openId = state.invoiceId;
  const openWasSaved = Boolean(readRecord(openId));
  let openUpdated = false;
  let openDeleted = false;

  applying = true;
  try {
    if (result.writeInvoices.length) {
      const restored = restoreBackup({
        format: BACKUP_FORMAT, version: 1, invoices: result.writeInvoices,
        logos: remote?.logos || {}, clients: [], templates: [], brands: []
      });
      if (restored.failed) throw Object.assign(Error("Browser storage is full, so invoices from Google Drive could not all be added here."), { status: -1 });
      openUpdated = restored.changedIds.includes(openId);
    }
    for (const { id, deletedAt } of result.deleteInvoices) {
      if (id === openId) openDeleted = true;
      else deleteInvoiceRecord(id, { deletedAt });
    }
    writeDeletedInvoices(result.merged.deleted);
    if (result.lists.clients) writeClients(result.lists.clients);
    if (result.lists.templates) writeTemplates(result.lists.templates);
    if (result.lists.brands) writeBrands(result.lists.brands);
  } finally {
    applying = false;
  }

  // Show what arrived.
  let notice = "";
  if (openDeleted) {
    deleteInvoice(openId);
    notice = "The invoice you had open was deleted on another device.";
  } else if (openUpdated) {
    const snapshot = loadSavedInvoice(openId);
    if (snapshot) {
      applySnapshot({ ...snapshot, zoom: state.zoom }, { persist: false });
      resetHistory();
      refreshKnownRecord();
      notice = "This invoice was updated with changes made on another device.";
    }
  } else if (!openWasSaved && result.writeInvoices.length && listInvoices().length) {
    // A fresh, untouched invoice was showing: open the latest saved one instead.
    openInvoice(listInvoices()[0].id);
  }
  if (result.remoteChanges) {
    refreshLibraries();
    refreshClientPicker();
    notifyDocumentsChanged();
    if (!notice && !meta.lastSyncAt && result.writeInvoices.length) {
      notice = `Loaded ${plural(result.writeInvoices.length, "invoice")} from your Google Drive.`;
    }
  }

  // Upload, unless Drive already has exactly this.
  const clients = normalizeClients(listClients());
  const templates = normalizeNamed(listTemplates());
  const brands = normalizeNamed(listBrands());
  const upload = {
    ...result.merged,
    app: "SA Invoice Generator " + APP_VERSION,
    exportedAt: new Date().toISOString(),
    deleted: readDeletedInvoices(),
    clients, templates, brands
  };
  let saved = file;
  const needsUpload = !file || (remote ? contentHash(upload) !== contentHash(remote) : true);
  if (needsUpload) {
    const text = JSON.stringify(upload);
    saved = file ? await updateSyncFile(token, file.id, text) : await createSyncFile(token, text);
  }
  updateMeta({
    fileId: saved.id,
    version: String(saved.version ?? ""),
    lastSyncAt: new Date().toISOString(),
    base: { clients: listHash(clients), templates: listHash(templates), brands: listHash(brands) }
  });
  return { notice };
}

/** Uploads soon after a change (see PUSH_DELAY_MS and PUSH_MAX_WAIT_MS). */
function schedulePush(delay = PUSH_DELAY_MS) {
  if (!signedIn()) return;
  if (!currentToken()) {
    setStatus("reconnect");
    return;
  }
  const now = Date.now();
  if (!firstPendingAt) firstPendingAt = now;
  const wait = Math.max(0, Math.min(delay, firstPendingAt + PUSH_MAX_WAIT_MS - now));
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    syncNow();
  }, wait);
}

function markDirty() {
  if (!signedIn()) return;
  if (!readMeta().dirty) {
    updateMeta({ dirty: true });
    render();
  }
  schedulePush();
}

/* --------------------------------------------------- sign in and out */

/**
 * Gets a token from Google and checks which account it is for.
 * @returns {Promise<string|null>} the token, or null if the user cancelled
 */
async function connect({ chooseAccount }) {
  const meta = readMeta();
  const token = await requestToken({ email: meta.email || meta.lastEmail || "", chooseAccount });
  const account = await getAccount(token);
  if (!account.email) throw Error("Google did not say which account you signed in with. Please try again.");
  const previous = (meta.email || meta.lastEmail || "").toLowerCase();
  const switching = previous && previous !== account.email.toLowerCase();
  if (switching && listInvoices().length) {
    const ok = await confirmAction({
      title: "Use a different Google account?",
      message: `The invoices in this browser were synced with ${meta.email || meta.lastEmail}. ` +
        `If you continue, they will also be added to the Google Drive of ${account.email}. ` +
        "To keep them apart, cancel, sign out and remove them from this browser first.",
      confirmLabel: "Continue",
      cancelLabel: "Cancel"
    });
    if (!ok) {
      forgetToken();
      render();
      return null;
    }
  }
  const sameAccount = !switching && meta.fileId;
  writeMeta({
    ...(sameAccount ? meta : {}),
    email: account.email,
    name: account.name,
    lastEmail: account.email,
    // Everything here goes to Drive on the first sync with an account.
    dirty: sameAccount ? Boolean(meta.dirty) : true
  });
  return token;
}

async function signIn() {
  try {
    const token = await connect({ chooseAccount: true });
    if (!token) return;
    render();
    const ok = await syncNow();
    if (ok) {
      const count = listInvoices().length;
      toast(`Signed in. ${plural(count, "invoice")} synced with your Google Drive.`);
    }
  } catch (err) {
    toastError(err.message);
    render();
  }
}

/** Deletes everything the app stored in this browser, then reloads. */
function removeLocalData() {
  clearInvoice();
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("invoiceStudio")) keys.push(key);
  }
  for (const key of keys) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
  location.reload();
}

async function signOut() {
  const meta = readMeta();
  const ok = await confirmAction({
    title: "Sign out of Google Drive sync?",
    message: `Changes in this browser will no longer be saved to the Google Drive of ${meta.email}.`,
    confirmLabel: "Sign out"
  });
  if (!ok) return;

  if (readMeta().dirty && currentToken()) await syncNow();
  const unsynced = Boolean(readMeta().dirty);
  const remove = await confirmAction({
    title: "Remove your invoices from this browser?",
    message: unsynced
      ? "Some changes here have not reached Google Drive yet and would be lost. Keep them in this browser unless you are sure."
      : "Everything is in your Google Drive. On a shared or borrowed computer, remove the copy in this browser so the next person cannot see it. Signing in again brings it all back.",
    confirmLabel: "Remove from this browser",
    cancelLabel: "Keep in this browser",
    danger: true
  });
  forgetToken();
  writeMeta({ lastEmail: meta.email });
  clearTimeout(pushTimer);
  pushTimer = null;
  setStatus("idle");
  if (remove) {
    removeLocalData();
    return;
  }
  toast("Signed out. Your invoices stay in this browser and in your Google Drive.");
}

/* --------------------------------------------------------------- init */

export function initCloudSync() {
  const panel = $("panel-cloud");
  if (!panel) return;
  if (!syncConfigured()) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  if (!syncAvailableHere()) {
    $("cloudSignedOut").hidden = true;
    $("cloudSignedIn").hidden = true;
    $("cloudUnavailable").hidden = false;
    $("cloudHint").textContent = "Not available";
    return;
  }

  $("cloudSignInBtn").onclick = signIn;
  $("cloudSyncBtn").onclick = () => syncNow({ interactive: true });
  $("cloudSignOutBtn").onclick = signOut;
  $("cloudChip").onclick = () => syncNow({ interactive: true });

  onLocalWrite(key => {
    if (!applying && isSyncedKey(key)) markDirty();
  });

  // Another tab signed in or out, or renewed the sign-in.
  window.addEventListener("storage", event => {
    if (event.key === STORAGE_KEYS.cloudSync || event.key === STORAGE_KEYS.cloudToken || event.key === null) {
      if (status === "reconnect" && currentToken()) status = "idle";
      render();
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!signedIn() || !currentToken()) return;
    if (document.visibilityState === "hidden") {
      if (readMeta().dirty) syncNow();
      return;
    }
    const last = readMeta().lastSyncAt;
    if (!last || Date.now() - new Date(last).getTime() > STALE_AFTER_MS) syncNow();
  });
  window.addEventListener("online", () => { if (signedIn() && currentToken()) syncNow(); });
  window.addEventListener("offline", () => { if (signedIn()) setStatus("offline"); });
  setInterval(() => {
    if (document.visibilityState === "visible" && signedIn() && currentToken() && !syncing) syncNow();
    else if (signedIn()) render();
  }, PULL_INTERVAL_MS);
  // Keeps "Last synced 3 min ago" current, and notices an expired sign-in.
  setInterval(() => {
    if (signedIn() && status === "idle" && !currentToken()) setStatus("reconnect");
    else render();
  }, 30000);

  // Loaded ahead, so Google's window opens straight from the click.
  loadGoogleScript().catch(() => {});

  render();
  if (signedIn()) {
    if (currentToken()) syncNow();
    else setStatus("reconnect");
  }
}
