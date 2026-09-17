/** JSON invoice export and import. */

import { download, fieldValue } from "../utils.js";
import { serialize } from "../invoice/invoice-data.js";

export function exportInvoiceJSON() {
  const name = (fieldValue("invoiceNumber") || "invoice") + ".json";
  download(name, JSON.stringify(serialize(), null, 2));
}

/**
 * Parses a user-selected .json file into a snapshot object.
 * Throws with a user-facing message on unreadable or invalid input.
 */
export async function readInvoiceFile(file) {
  if (!file) throw Error("No file selected.");
  return JSON.parse(await file.text());
}
