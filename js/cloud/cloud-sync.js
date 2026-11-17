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
 *    be renewed from a click. With "Stay signed in" (the default) the app
 *    renews it on the next click anywhere, a few minutes before it runs out,
 *    so sync carries on all day. If that fails (say the laptop was asleep),
 *    the sync button says "Click to keep syncing". The app keeps working and
 *    saving locally throughout; changes are uploaded once renewed.
 *  - Since 2.14.0 the sync file lives in a folder, "SA Invoice Generator",
 *    with a Backups folder of dated backups (js/cloud/drive-backups.js).
 *  - "Sync automatically" can be turned off in Settings; then sync runs
 *    only when Sync now is pressed.
 *
 * Off unless a Google client ID is set in js/config.js.
 */

import { $, toast, toastError, today } from "../utils.js";
import { dateFmt } from "../invoice/formatters.js";
import { STORAGE_KEYS, APP_VERSION } from "../constants.js";
import { readJSON, writeJSON, onLocalWrite } from "../storage/local-storage.js";
import { syncConfigured, syncAvailableHere, loadGoogleScript, currentToken, forgetToken, requestToken } from "./google-auth.js";
import { getAccount, findSyncFile, readSyncFile, createSyncFile, updateSyncFile, moveToFolder } from "./drive-api.js";
import { ensureFolders, listBackups, createBackup, tidyBackups, readBackup } from "./drive-backups.js";
import { backupDue } from "./backup-retention.js";
import { readSettings, onSettingsChange } from "../settings-store.js";
import { showView, onViewChange, currentView } from "../editor/appbar.js";
import { restoreFromData } from "../editor/invoices.js";
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
const PULL_INTERVAL_MS = 60 * 1000;
/** Renew the Google sign-in on a click when it has less than this left. */
const RENEW_AHEAD_MS = 10 * 60 * 1000;
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
 *   deviceId        a random id for this browser, written into the sync
 *                   file so other devices can say where a change came from
 *   folderId, backupsId, fileInFolder   the app's Drive folders (2.14.0)
 *   lastRemote      {device, at}: the last change made on another device
 *   lastDriveBackupAt  when this browser last made a Drive backup
 */
function readMeta() {
  const meta = readJSON(STORAGE_KEYS.cloudSync, {});
  return meta && typeof meta === "object" && !Array.isArray(meta) ? meta : {};
}
const writeMeta = meta => writeJSON(STORAGE_KEYS.cloudSync, meta);
const updateMeta = patch => writeMeta({ ...readMeta(), ...patch });
const signedIn = () => Boolean(readMeta().email);

/** "idle" | "syncing" | "renewing" | "reconnect" | "error" | "offline" */
let status = "idle";
/** A sign-in renewal in progress (see renewOnGesture). */
let renewing = null;
let lastRenewAttempt = 0;
/** Folder checks are done once per page load. */
let foldersChecked = false;
let backupsCache = null;
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

const deviceName = () => readSettings().deviceName;
const autoSync = () => readSettings().autoSync !== false;
const staySignedIn = () => readSettings().staySignedIn !== false;

function deviceId() {
  const meta = readMeta();
  if (meta.deviceId) return meta.deviceId;
  const id = crypto.randomUUID();
  updateMeta({ deviceId: id });
  return id;
}

/** "today at 14:52", "yesterday at 09:10", "on 3 Nov 2026 at 10:00". */
function whenText(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const day = localDay(date);
  const now = new Date();
  if (day === localDay(now)) return "today at " + time;
  if (day === localDay(new Date(now.getTime() - 864e5))) return "yesterday at " + time;
  return "on " + dateFmt(day) + " at " + time;
}
const localDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** What the sync button, popover and Settings say, by state. */
function describe(meta) {
  const last = meta.lastSyncAt ? "Last synced " + ago(meta.lastSyncAt) + "." : "Not synced yet.";
  const waiting = meta.dirty ? " Some changes are not in Drive yet." : "";
  if (status === "syncing") return { chip: "Saving to Drive", cls: "syncing", title: "Saving to Google Drive", line: "Syncing with Google Drive\u2026", box: "" };
  if (status === "renewing") return { chip: "Renewing sign-in", cls: "renewing", title: "Renewing your Google sign-in", line: "Google's hourly sign-in ran out. It is renewed on your next click; nothing to do." + waiting, box: "muted" };
  if (status === "reconnect") return { chip: "Click to keep syncing", cls: "reconnect", title: "Click to keep syncing", line: "Click to reconnect to Google Drive (a Google sign-in lasts about an hour). Your work is still saved in this browser." + waiting, box: "attention" };
  if (status === "offline") return { chip: "Offline", cls: "offline", title: "You are offline", line: "You are offline. Changes are saved in this browser and will sync when you are back online." + waiting, box: "muted" };
  if (status === "error") return { chip: "Sync problem", cls: "error", title: "Sync problem", line: statusDetail + " " + last + waiting, box: "problem" };
  if (!autoSync()) return { chip: "Sync is off", cls: "off", title: "Automatic sync is off", line: "Automatic sync is turned off in Settings. Changes stay on this device until you press Sync now. " + last + waiting, box: "muted" };
  if (meta.dirty) return { chip: "Saving to Drive", cls: "pending", title: "Saving to Google Drive", line: "Changes waiting to sync\u2026 " + last, box: "" };
  return { chip: "Synced", cls: "saved", title: "Synced with Google Drive", line: meta.lastSyncAt ? "Synced " + ago(meta.lastSyncAt) + ". Everything on this device is in Drive." : "Not synced yet.", box: "" };
}

function render() {
  const panel = $("panel-cloud");
  if (!panel) return;
  const meta = readMeta();
  const isIn = Boolean(meta.email);
  $("cloudSignedOut").hidden = isIn;
  $("cloudSignedIn").hidden = !isIn;
  $("set-sync").hidden = !isIn;
  $("driveBackups").hidden = !isIn;
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
    $("cloudHint").textContent = "Not signed in";
    $("syncPopover").hidden = true;
    return;
  }

  $("cloudName").textContent = meta.name || meta.email;
  $("cloudEmail").textContent = meta.name ? meta.email : "";
  $("cloudAvatar").textContent = (meta.name || meta.email || "?").trim().charAt(0).toUpperCase();

  const d = describe(meta);
  $("cloudStatus").textContent = d.line;
  $("syncStatusBox").className = "sync-status" + (d.box ? " " + d.box : "");
  $("syncLastRemote").textContent = meta.lastRemote?.device
    ? `The last change from another device came from ${meta.lastRemote.device}, ${whenText(meta.lastRemote.at)}.` : "";
  $("cloudHint").textContent = status === "reconnect" ? "Reconnect needed" : status === "error" ? "Problem" : "Signed in";
  chip.className = "sync-btn " + d.cls;
  chipText.textContent = d.chip;
  chip.setAttribute("aria-label", d.chip + ". Google Drive sync details");
  chip.title = status === "reconnect"
    ? "Click to reconnect Google Drive (" + meta.email + ")"
    : "Google Drive sync (" + meta.email + "). " + d.line;
  $("syncPopTitle").textContent = d.title;
  $("syncPopText").textContent = d.line;
  $("syncPopDevice").textContent = "This device: " + deviceName();
  $("syncPopEmail").textContent = meta.email;
  const reconnect = status === "reconnect";
  $("cloudSyncBtn").textContent = reconnect ? "Reconnect" : "Sync now";
  $("syncPopSyncBtn").textContent = reconnect ? "Reconnect" : "Sync now";
  $("cloudSyncBtn").disabled = status === "syncing";
  $("syncPopSyncBtn").disabled = status === "syncing";
  if (meta.folderId) $("driveFolderLink").href = "https://drive.google.com/drive/folders/" + encodeURIComponent(meta.folderId);
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
  if (!token && renewing) {
    await renewing.catch(() => {});
    token = currentToken();
  }
  if (!token) {
    if (!interactive) {
      setStatus(staySignedIn() && Date.now() - lastRenewAttempt > 60000 ? "renewing" : "reconnect");
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
    // A dated backup in the Backups folder, once a day (or week).
    autoBackup(token).catch(err => console.error("[SA Invoice Generator] Drive backup failed:", err));
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

  // The app's folder: made once, and the sync file moved into it.
  if (!foldersChecked || !meta.folderId) {
    const folders = await ensureFolders(token, meta);
    updateMeta(folders);
    foldersChecked = true;
    Object.assign(meta, folders);
  }
  const file = await findSyncFile(token, meta.fileId);
  if (file && (!meta.fileInFolder || meta.fileId !== file.id)) {
    await moveToFolder(token, file.id, meta.folderId);
    updateMeta({ fileInFolder: true });
  }
  const remoteUnchanged = Boolean(file && file.id === meta.fileId && meta.version && String(file.version) === String(meta.version));
  let remote = null;
  if (file && !remoteUnchanged) {
    remote = await readSyncFile(token, file.id);
    inspectBackup(remote); // throws if it is not a backup this app can read
    if (remote.deviceId && remote.deviceId !== deviceId() && remote.exportedAt) {
      updateMeta({ lastRemote: { device: String(remote.device || "another device").slice(0, 40), at: remote.exportedAt } });
    }
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
    device: deviceName(),
    deviceId: deviceId(),
    deleted: readDeletedInvoices(),
    clients, templates, brands
  };
  let saved = file;
  const needsUpload = !file || (remote ? contentHash(upload) !== contentHash(remote) : true);
  if (needsUpload) {
    const text = JSON.stringify(upload);
    saved = file ? await updateSyncFile(token, file.id, text) : await createSyncFile(token, text, meta.folderId);
    if (!file) updateMeta({ fileInFolder: true });
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
  if (!autoSync()) {
    render();
    return;
  }
  if (!currentToken()) {
    if (status !== "syncing") setStatus(staySignedIn() && Date.now() - lastRenewAttempt > 60000 ? "renewing" : "reconnect");
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

/* ------------------------------------------------------------ backups */

/** Makes a dated backup in the Backups folder when one is due. */
async function autoBackup(token) {
  const settings = readSettings();
  const meta = readMeta();
  if (!backupDue(meta.lastDriveBackupAt || "", settings.backupFrequency, today())) return;
  const backups = await listBackups(token);
  const name = `${today()} Backup.json`;
  if (settings.backupFrequency === "daily" && backups.some(b => b.name === name)) {
    updateMeta({ lastDriveBackupAt: new Date().toISOString() });
    return;
  }
  await makeBackup(token, "auto", backups);
}

/** Saves a backup now and tidies old ones. */
async function makeBackup(token, kind, known = null) {
  const meta = readMeta();
  const folders = meta.backupsId ? meta : await ensureFolders(token, meta);
  if (!meta.backupsId) updateMeta(folders);
  flushInvoiceSave();
  const backups = known || await listBackups(token);
  let name = `${today()} Backup.json`;
  if (backups.some(b => b.name === name)) {
    const now = new Date();
    name = `${today()} ${String(now.getHours()).padStart(2, "0")}.${String(now.getMinutes()).padStart(2, "0")} Backup.json`;
  }
  const made = await createBackup(token, folders.backupsId, buildBackup(), { name, device: deviceName(), kind });
  updateMeta({ lastDriveBackupAt: new Date().toISOString() });
  const all = [made, ...backups.filter(b => b.id !== made.id)];
  const removed = await tidyBackups(token, all, readSettings().backupKeep);
  backupsCache = removed ? null : all;
  if (currentView() === "settings") renderBackupList();
  return made;
}

async function backUpNow() {
  const button = $("driveBackupNowBtn");
  button.disabled = true;
  try {
    const token = await tokenFor({ interactive: true });
    if (!token) return;
    const made = await makeBackup(token, "manual");
    toast(`Backup saved in Google Drive: SA Invoice Generator / Backups / ${made.name}.`);
  } catch (err) {
    toastError(err.message || "The backup could not be saved.");
  } finally {
    button.disabled = false;
  }
}

/** A token now, renewing it from a click when needed. */
async function tokenFor({ interactive }) {
  let token = currentToken();
  if (!token && renewing) {
    await renewing.catch(() => {});
    token = currentToken();
  }
  if (!token && interactive) token = await connect({ chooseAccount: false });
  return token;
}

const plainDate = iso => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : whenText(iso).replace(/^on /, "").replace(/^./, c => c.toUpperCase());
};

/** The backups in Drive, each with Restore. */
async function renderBackupList({ refresh = false } = {}) {
  const root = $("driveBackupList");
  if (!root || !signedIn()) return;
  const token = currentToken();
  if (!token) {
    root.innerHTML = '<p class="hint">Sign in again (Sync now) to see your backups.</p>';
    return;
  }
  try {
    if (refresh || !backupsCache) backupsCache = await listBackups(token);
  } catch (err) {
    root.innerHTML = "";
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "Your backups could not be listed: " + err.message;
    root.appendChild(p);
    return;
  }
  const list = backupsCache;
  $("folderBackupsLine").textContent = list.length
    ? `${list[0].name}${list.length > 1 ? ` and ${list.length - 1} more` : ""}` : "No backups yet";
  if (!list.length) {
    root.innerHTML = '<p class="hint">No backups yet. One is made on the first sync of the day, or press Back up now.</p>';
    return;
  }
  const shown = list.slice(0, 8);
  root.replaceChildren(...shown.map(backup => {
    const item = document.createElement("div");
    item.className = "backup-item";
    const text = document.createElement("span");
    const when = document.createElement("span");
    when.className = "backup-when";
    when.textContent = plainDate(backup.createdTime) || backup.name;
    const what = document.createElement("span");
    what.className = "backup-what";
    const props = backup.appProperties || {};
    what.textContent = [props.device, props.invoices ? plural(Number(props.invoices), "invoice") : "", props.kind === "manual" ? "made with Back up now" : ""].filter(Boolean).join(", ");
    text.append(when, what);
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "btn small";
    restore.textContent = "Restore";
    restore.setAttribute("aria-label", "Restore the backup from " + when.textContent);
    restore.onclick = async () => {
      restore.disabled = true;
      try {
        const t = await tokenFor({ interactive: true });
        if (!t) return;
        const data = await readBackup(t, backup.id);
        await restoreFromData(data, { from: "from " + when.textContent.replace(/^./, c => c.toLowerCase()) });
      } catch (err) {
        toastError(err.message || "That backup could not be restored.");
      } finally {
        restore.disabled = false;
      }
    };
    item.append(text, restore);
    return item;
  }));
  if (list.length > shown.length) {
    const more = document.createElement("p");
    more.className = "hint";
    more.textContent = `${list.length - shown.length} older backups are in the Backups folder. Download one there, then use Restore from a file.`;
    root.appendChild(more);
  }
}

/* ------------------------------------------------- staying signed in */

/**
 * Renews Google's sign-in from a click or key press (a browser opens Google's
 * window only from one), a few minutes before it runs out or once it has.
 */
function renewOnGesture(e) {
  if (e.type === "pointerdown" && e.pointerType && e.pointerType !== "mouse") return;
  if (e.type === "pointerup" && (!e.pointerType || e.pointerType === "mouse")) return;
  if (!signedIn() || !staySignedIn() || renewing || syncing && currentToken()) return;
  const saved = readJSON(STORAGE_KEYS.cloudToken, null);
  const left = saved ? Number(saved.expiresAt) - Date.now() : 0;
  if (left > RENEW_AHEAD_MS) return;
  if (Date.now() - lastRenewAttempt < 60000) return;
  lastRenewAttempt = Date.now();
  const meta = readMeta();
  renewing = requestToken({ email: meta.email || meta.lastEmail || "" })
    .then(() => {
      if (status === "renewing" || status === "reconnect") setStatus("idle");
      if (readMeta().dirty || left <= 0) syncNow();
    })
    .catch(err => {
      console.warn("[SA Invoice Generator] sign-in renewal failed:", err.message);
      if (!currentToken()) setStatus("reconnect");
    })
    .finally(() => { renewing = null; });
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
  writeMeta({ lastEmail: meta.email, deviceId: meta.deviceId });
  foldersChecked = false;
  backupsCache = null;
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
  if (!syncConfigured() || !syncAvailableHere()) {
    $("cloudSignedOut").hidden = true;
    $("cloudSignedIn").hidden = true;
    $("set-sync").hidden = true;
    $("driveBackups").hidden = true;
    $(syncConfigured() ? "cloudUnavailable" : "cloudNotConfigured").hidden = false;
    $("cloudHint").textContent = "Not available";
    return;
  }

  $("cloudSignInBtn").onclick = signIn;
  $("cloudSyncBtn").onclick = () => syncNow({ interactive: true });
  $("cloudSignOutBtn").onclick = signOut;
  $("cloudSwitchBtn").onclick = signIn;
  $("driveBackupNowBtn").onclick = backUpNow;

  // The sync button: details and Sync now; when a click is needed to
  // reconnect, the click itself reconnects.
  const chip = $("cloudChip");
  const pop = $("syncPopover");
  const closePop = (refocus = false) => {
    if (pop.hidden) return;
    pop.hidden = true;
    chip.setAttribute("aria-expanded", "false");
    if (refocus) chip.focus();
  };
  chip.onclick = () => {
    if (status === "reconnect") {
      closePop();
      syncNow({ interactive: true });
      return;
    }
    if (!pop.hidden) return closePop();
    render();
    pop.hidden = false;
    chip.setAttribute("aria-expanded", "true");
    $("syncPopSyncBtn").focus();
  };
  $("syncPopSyncBtn").onclick = () => { closePop(true); syncNow({ interactive: true }); };
  $("syncPopSettingsBtn").onclick = () => { closePop(); showView("settings", { section: "set-sync" }); };
  pop.addEventListener("keydown", e => { if (e.key === "Escape") { e.preventDefault(); closePop(true); } });
  document.addEventListener("pointerdown", e => {
    if (!pop.hidden && !pop.contains(e.target) && !chip.contains(e.target)) closePop();
  });

  // Staying signed in: renew on a click or key press when needed.
  for (const type of ["pointerdown", "pointerup", "keydown"]) document.addEventListener(type, renewOnGesture, true);

  onSettingsChange(settings => {
    render();
    if (settings.autoSync && readMeta().dirty) schedulePush(1000);
  });
  onViewChange(view => { if (view === "settings") renderBackupList({ refresh: true }); });

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
    if (!signedIn() || !currentToken() || !autoSync()) return;
    if (document.visibilityState === "hidden") {
      if (readMeta().dirty) syncNow();
      return;
    }
    const last = readMeta().lastSyncAt;
    if (!last || Date.now() - new Date(last).getTime() > STALE_AFTER_MS) syncNow();
  });
  window.addEventListener("online", () => { if (signedIn() && currentToken() && autoSync()) syncNow(); });
  window.addEventListener("offline", () => { if (signedIn()) setStatus("offline"); });
  setInterval(() => {
    if (document.visibilityState === "visible" && signedIn() && currentToken() && !syncing && autoSync()) syncNow();
    else if (signedIn()) render();
  }, PULL_INTERVAL_MS);
  // Keeps "Last synced 3 min ago" current, and notices an expired sign-in.
  setInterval(() => {
    if (signedIn() && status === "idle" && !currentToken() && !renewing) setStatus(staySignedIn() ? "renewing" : "reconnect");
    else render();
  }, 30000);

  // Loaded ahead, so Google's window opens straight from the click.
  loadGoogleScript().catch(() => {});

  render();
  if (signedIn()) {
    if (currentToken()) syncNow();
    else setStatus(staySignedIn() ? "renewing" : "reconnect");
  }
  if (currentView() === "settings") renderBackupList();
}
