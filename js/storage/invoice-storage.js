/**
 * Persistence for the single working invoice (autosave).
 * Kept separate from the saved template and brand libraries.
 */

import { STORAGE_KEYS, AUTOSAVE_TYPING_DELAY_MS } from "../constants.js";
import { readRaw, writeRaw, remove } from "./local-storage.js";
import { serialize } from "../invoice/invoice-data.js";
import { recordChange } from "../history/invoice-history.js";
import { toast, trimmedField, fieldValue, toastError } from "../utils.js";
import { state } from "../state.js";
import { getTotals } from "../invoice/calculations.js";
import { saveInvoiceRecord, isInvoiceId, readRecordText } from "./invoice-library.js";

/** Whether the previous autosave succeeded; used to report a failure once. */
let lastSaveOk = true;
/** Pending write for typing edits, see saveInvoice(). */
let pendingWrite = null;
/** Set by clearInvoice(): nothing may be written before the page reloads. */
let writesStopped = false;
/** While true, writes are held back (another tab changed the invoice and the
 *  user has not yet chosen which version to keep). */
let writesHeld = false;
/** Listeners told after each successful write (used by the multi-tab check). */
const writeListeners = new Set();

export const onInvoiceWritten = fn => { writeListeners.add(fn); };

/**
 * Save status for the indicator next to the app name:
 * "pending" (typing not written yet), "saved", "failed" or "held" (another
 * tab changed this invoice and the user has not chosen a version yet).
 */
const saveStateListeners = new Set();
let currentSaveState = { status: "saved", at: null };
export const onSaveState = fn => { saveStateListeners.add(fn); fn(currentSaveState); };
function setSaveState(status) {
  currentSaveState = { status, at: status === "saved" ? new Date() : currentSaveState.at };
  saveStateListeners.forEach(fn => fn(currentSaveState));
}

function writeNow({ record = true } = {}) {
  if (pendingWrite !== null) {
    clearTimeout(pendingWrite);
    pendingWrite = null;
  }
  if (writesStopped) return true;
  if (writesHeld) {
    setSaveState("held");
    return true;
  }
  const snapshot = serialize();
  const text = JSON.stringify(snapshot);
  let stored = writeRaw(STORAGE_KEYS.invoice, text);
  // The same invoice is kept up to date in the saved-invoices library.
  let recordText = null;
  if (stored && isInvoiceId(state.invoiceId)) {
    if (record) {
      const saved = saveInvoiceRecord(state.invoiceId, snapshot, invoiceSummary());
      stored = saved.ok;
      recordText = saved.text || null;
    } else {
      // Only the "open invoice" pointer changed; the saved record is as read.
      recordText = readRecordText(state.invoiceId);
    }
  }
  if (!stored && lastSaveOk) {
    toastError("Autosave failed: browser storage is full or unavailable. Use Export JSON to keep a copy.");
  }
  lastSaveOk = stored;
  setSaveState(stored ? "saved" : "failed");
  if (stored) writeListeners.forEach(fn => fn(text, recordText));
  return stored;
}

/** What the saved-invoices list shows for the current invoice. */
export function invoiceSummary() {
  return {
    number: trimmedField("invoiceNumber"),
    client: trimmedField("clientName").split(/\r?\n/)[0] || "",
    invoiceDate: fieldValue("invoiceDate"),
    total: getTotals().total,
    currency: fieldValue("currency")
  };
}

/** Holds or releases autosave writes; see js/storage/tab-sync.js. */
export function holdInvoiceWrites(hold) {
  const wasHeld = writesHeld;
  writesHeld = Boolean(hold);
  if (writesHeld) setSaveState("held");
  // Released: whichever version was chosen is now what is stored.
  else if (wasHeld) setSaveState("saved");
}

/**
 * Writes the current invoice now, replacing whatever is stored.
 * @param {{record?: boolean}} [options] record: false updates only which
 *        invoice is open, without re-saving (and re-dating) its record.
 */
export function writeInvoiceNow(options) {
  return writeNow(options);
}

/** Writes any pending typing edit immediately. */
export function flushInvoiceSave() {
  if (pendingWrite !== null) writeNow();
}

// A pending edit is written before the page is hidden, closed or reloaded.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushInvoiceSave);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushInvoiceSave();
  });
}

/**
 * Autosaves the current invoice.
 *
 * A failed write (storage full, disabled or blocked) is reported to the user
 * once, when saving first starts failing, and again only after a save has
 * succeeded in between. Previously failures were silent, so a large logo could
 * stop the invoice being saved without any sign.
 *
 * Typing edits ({typing: true}) are written after a short pause; every other
 * change is written immediately, and a pending edit is written before the page
 * is hidden or closed.
 *
 * This is also where undo history is recorded. Every mutation in the app ends
 * with a saveInvoice() call, so using it as the single funnel means no editor
 * path can change the invoice without history noticing.
 *
 * @param {{typing?: boolean}} [options] set typing for keystroke-driven edits,
 *        which are coalesced into one history entry instead of one per key.
 */
export function saveInvoice(options) {
  let stored = true;
  if (options && options.typing) {
    // Keystrokes are written once typing pauses, not on every key: serialising
    // the invoice (logo included) per keystroke made typing lag.
    if (pendingWrite !== null) clearTimeout(pendingWrite);
    pendingWrite = setTimeout(() => writeNow(), AUTOSAVE_TYPING_DELAY_MS);
    if (!writesHeld) setSaveState("pending");
  } else {
    stored = writeNow();
  }
  recordChange(options);
  return stored;
}

/**
 * Keeps an unreadable autosave under a separate key so the next autosave does
 * not destroy it. Returns whether the copy was written.
 */
export function backupUnreadableInvoice(raw = readRaw(STORAGE_KEYS.invoice)) {
  if (raw === null) return false;
  return writeRaw(STORAGE_KEYS.invoiceBackup, raw);
}

/**
 * Reads the autosave.
 * @returns {{data: object|null, corrupt: boolean, backedUp: boolean}}
 *   corrupt is true when something was stored but could not be parsed; in that
 *   case the raw text has already been copied to STORAGE_KEYS.invoiceBackup.
 */
export function readInvoiceAutosave() {
  const raw = readRaw(STORAGE_KEYS.invoice);
  if (raw === null) return { data: null, corrupt: false, backedUp: false };
  try {
    return { data: JSON.parse(raw), corrupt: false, backedUp: false };
  } catch {
    return { data: null, corrupt: true, backedUp: backupUnreadableInvoice(raw) };
  }
}

/** Returns the autosaved snapshot, or null when absent or corrupt. */
export function loadInvoice() {
  return readInvoiceAutosave().data;
}

/**
 * Deletes the autosave before a full reset. Pending and later writes are
 * cancelled, so the page reload that follows cannot write the old invoice back.
 */
export function clearInvoice() {
  if (pendingWrite !== null) clearTimeout(pendingWrite);
  pendingWrite = null;
  writesStopped = true;
  return remove(STORAGE_KEYS.invoice);
}
