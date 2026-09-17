/** Entry point for spreadsheet import: picks the right reader, then maps rows. */

import { parseCSV } from "./csv.js";
import { readWorkbookRows } from "./xlsx.js";
import { mapRows } from "./row-mapper.js";

const isCSV = file => file.name.toLowerCase().endsWith(".csv");

/**
 * Reads a CSV/XLSX/XLS file into line items.
 * Throws with a user-facing message when nothing usable is found.
 */
export async function readItemsFromFile(file) {
  const rows = isCSV(file) ? parseCSV(await file.text()) : await readWorkbookRows(file);
  const items = mapRows(rows);
  if (!items.length) throw Error("No usable invoice rows were found.");
  return items;
}
