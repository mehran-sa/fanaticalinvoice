/**
 * Keeps two open tabs (or windows) of the app from silently overwriting each
 * other's work.
 *
 * Each saved invoice has its own record (js/storage/invoice-library.js), so two
 * tabs working on different invoices never interfere. When another tab saves
 * the invoice that is open here, this tab stops saving and asks which version
 * to keep:
 *   - "Load the other version" replaces this tab's copy with the saved one;
 *   - "Keep this version" saves this tab's copy over the other one.
 * If another tab deletes the open invoice, this tab asks whether to keep it
 * (save it again) or close it.
 * Changes to the invoice list, saved clients, templates and brands are shown.
 */

import { STORAGE_KEYS } from "../constants.js";
import { $, toast, toastError } from "../utils.js";
import { state } from "../state.js";
import { holdInvoiceWrites, writeInvoiceNow, onInvoiceWritten } from "./invoice-storage.js";
import { recordKey, readRecordText, loadSavedInvoice } from "./invoice-library.js";
import { confirmAction } from "../ui/confirm-dialog.js";
import { applySnapshot } from "../session.js";
import { refreshLibraries } from "../editor/library.js";
import { refreshClientPicker } from "../editor/clients.js";
import { notifyDocumentsChanged, deleteInvoice } from "../documents.js";
import { resetHistory } from "../history/invoice-history.js";

/** The open invoice's record as this tab last wrote or loaded it. */
let lastKnown = null;
let asking = false;

/**
 * Same content? The save time and the per-tab preview zoom are ignored, so a
 * re-save of identical content never counts as a change.
 */
function sameRecord(a, b) {
  if (a === b) return true;
  if (a === null || b === null) return false;
  try {
    const strip = text => {
      const record = JSON.parse(text);
      delete record.updatedAt;
      if (record.data) delete record.data.zoom;
      return JSON.stringify(record);
    };
    return strip(a) === strip(b);
  } catch {
    return false;
  }
}

async function ask() {
  const dialog = $("appConfirmDialog");
  if (dialog?.open) await new Promise(resolve => dialog.addEventListener("close", resolve, { once: true }));

  const id = state.invoiceId;
  const stored = readRecordText(id);
  if (sameRecord(stored, lastKnown)) {
    asking = false;
    holdInvoiceWrites(false);
    return;
  }
  const deleted = stored === null;
  const loadOther = await confirmAction({
    title: deleted ? "Invoice deleted in another tab" : "Invoice changed in another tab",
    message: deleted
      ? "This invoice was deleted in another tab or window of SA Invoice Generator. Keep it (it will be saved again), or close it?"
      : "This invoice was also edited in another tab or window of SA Invoice Generator. Load that version here, or keep this tab's version and save it over the other one?",
    confirmLabel: deleted ? "Close it" : "Load the other version",
    cancelLabel: deleted ? "Keep it" : "Keep this version"
  });
  asking = false;
  holdInvoiceWrites(false);

  if (!loadOther) {
    writeInvoiceNow();
    notifyDocumentsChanged();
    toast(deleted ? "The invoice was saved again." : "This tab's version was saved.");
    return;
  }
  if (deleted) {
    // Opens the most recent remaining invoice, or a new one.
    deleteInvoice(id);
    return;
  }
  const snapshot = loadSavedInvoice(id);
  if (!snapshot) {
    toastError("The other version could not be read. This tab's version was kept.");
    writeInvoiceNow();
    return;
  }
  applySnapshot({ ...snapshot, zoom: state.zoom }, { persist: false });
  lastKnown = readRecordText(id);
  resetHistory();
  notifyDocumentsChanged();
  toast("Loaded the version saved in the other tab.");
}

export function initTabSync() {
  lastKnown = readRecordText(state.invoiceId);
  onInvoiceWritten((_text, recordText) => { if (recordText) lastKnown = recordText; });

  window.addEventListener("storage", event => {
    if (event.storageArea !== localStorage) return;
    const key = event.key;
    if (key === STORAGE_KEYS.templates || key === STORAGE_KEYS.brands) return refreshLibraries();
    if (key === STORAGE_KEYS.clients) return refreshClientPicker();
    if (key === STORAGE_KEYS.invoiceIndex) return notifyDocumentsChanged();

    // key === null: all storage was cleared elsewhere.
    if (key !== recordKey(state.invoiceId) && key !== null) return;
    if (sameRecord(key === null ? null : event.newValue, lastKnown)) return;
    if (asking) return;
    asking = true;
    holdInvoiceWrites(true);
    ask();
  });
}
