/**
 * Persistence for the single working invoice (autosave).
 * Kept separate from the saved template and brand libraries.
 */

import { STORAGE_KEYS } from "../constants.js";
import { readJSON, writeJSON, remove } from "./local-storage.js";
import { serialize } from "../invoice/invoice-data.js";
import { recordChange } from "../history/invoice-history.js";

/**
 * Autosaves the current invoice. Best effort: failures are silent, as before.
 *
 * This is also where undo history is recorded. Every mutation in the app ends
 * with a saveInvoice() call, so using it as the single funnel means no editor
 * path can change the invoice without history noticing.
 *
 * @param {{typing?: boolean}} [options] set typing for keystroke-driven edits,
 *        which are coalesced into one history entry instead of one per key.
 */
export function saveInvoice(options) {
  const stored = writeJSON(STORAGE_KEYS.invoice, serialize());
  recordChange(options);
  return stored;
}

/** Returns the autosaved snapshot, or null when absent or corrupt. */
export function loadInvoice() {
  return readJSON(STORAGE_KEYS.invoice, null);
}

export function clearInvoice() {
  return remove(STORAGE_KEYS.invoice);
}
