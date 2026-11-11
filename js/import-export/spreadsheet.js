/** Entry point for spreadsheet import: picks the right reader, then maps rows. */

import { parseCSV } from "./csv.js";
import { readWorkbookRows } from "./xlsx.js";
import { readStatementRows } from "./row-mapper.js";

const isCSV = file => file.name.toLowerCase().endsWith(".csv");

/**
 * Reads a CSV/XLSX/XLS file into line items, plus the statement's own total
 * row when it has one (for the import check).
 * Throws with a user-facing message when nothing usable is found.
 */
export async function readItemsFromFile(file) {
  const rows = isCSV(file) ? parseCSV(await file.text()) : await readWorkbookRows(file);
  const { items, statementTotal } = readStatementRows(rows);
  if (!items.length) throw Error("No usable invoice rows were found.");
  return { items, statementTotal };
}
