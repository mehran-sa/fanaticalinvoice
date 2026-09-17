/**
 * "Reset all text fields" for the current invoice.
 *
 * Clears user-entered text and returns the invoice date to today, its normal
 * default. It deliberately leaves alone everything that
 * is configuration rather than content: template selection, columns, section
 * toggles, currency, dates, status, discount/tax/shipping rates, accent colour,
 * logo and its sizing, and both saved libraries. Nothing is removed from
 * localStorage - the autosave is simply rewritten with the cleared invoice.
 *
 * The field list is a subset of FIELD_IDS rather than a DOM sweep, so new
 * controls are opted in explicitly instead of being cleared by accident.
 */

import { $, today } from "../utils.js";
import { FIELD_IDS } from "../constants.js";
import { state } from "../state.js";

/**
 * Text content of the current invoice.
 *
 * Not included, deliberately:
 *   invoiceNumber - an identifier rather than prose, and the app's own default.
 *                   Move it into this list if you want it cleared too.
 *   status, currency, invoiceDate, dueDate, discount, tax, shipping - not text.
 */
export const TEXT_FIELD_IDS = [
  "companyName", "companyReg", "companyVat", "companyAddress",
  "companyPhone", "companyEmail", "companyWebsite",
  "clientName", "clientContact", "clientTax", "clientAddress", "clientEmail",
  "reference",
  "notes", "paymentDetails", "terms"
];

/** Every id above must be a known, persisted field. */
export const UNKNOWN_TEXT_FIELDS = TEXT_FIELD_IDS.filter(id => !FIELD_IDS.includes(id));

/**
 * Clears the text fields and the text cells of every line item. Line items
 * themselves are kept, along with their quantities, rates and amounts, so
 * calculations stay intact.
 *
 * @returns {{fields: number, itemCells: number}} how much was cleared
 */
export function resetTextFields() {
  let fields = 0;
  let itemCells = 0;

  for (const id of TEXT_FIELD_IDS) {
    const el = $(id);
    if (el && el.value !== "") {
      el.value = "";
      fields++;
    }
  }

  const textColumns = state.columns.filter(c => c.type === "text");
  for (const col of textColumns) {
    for (const item of state.items) {
      if (item[col.key] !== undefined && item[col.key] !== "") {
        item[col.key] = "";
        itemCells++;
      }
    }
  }

  return { fields, itemCells };
}

/**
 * Returns the invoice date to its default: today.
 *
 * The due date is left as it is - it is a term the user chose, not content, and
 * the update brief asked only for the invoice date.
 *
 * @returns {boolean} whether the value actually changed
 */
export function resetInvoiceDate() {
  const el = $("invoiceDate");
  if (!el) return false;
  const current = el.value;
  el.value = today();
  return el.value !== current;
}

/**
 * The whole reset, as one operation so it becomes a single undo step.
 * @returns {{fields: number, itemCells: number, dateReset: boolean}}
 */
export function resetInvoiceContent() {
  const cleared = resetTextFields();
  return { ...cleared, dateReset: resetInvoiceDate() };
}
