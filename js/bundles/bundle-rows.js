/**
 * Reads raw worksheet rows into bundle rows, and aggregates them.
 *
 * Note on header detection: this deliberately does NOT reuse
 * import-export/row-mapper.js. That module scores a row against many keywords
 * and always returns a best guess, which is right for invoice line items. Here
 * a "Name" column is mandatory - without it there is nothing to split - so the
 * search is exact and reports failure with -1.
 *
 * @typedef {Object} BundleRow
 * @property {string|number} SKU
 * @property {string} CourseName
 * @property {string} Bundle
 * @property {string|number} NetQty
 * @property {string|number} Royalty
 * @property {"."|","} Decimal  The sheet's decimal separator, used to read
 *                              NetQty and Royalty when they are text.
 */

import { splitName } from "./name-splitter.js";
import { parseAmount, detectDecimalSeparator } from "../utils.js";
import { findStatementTotal, isStatementTotalLabel } from "../import-export/statement-total.js";

/** How many leading rows are searched for the header. */
const HEADER_SEARCH_DEPTH = 40;

/** Index of the header row, or -1 when no "Name" column exists. */
export function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, HEADER_SEARCH_DEPTH); i++) {
    const normalized = rows[i].map(v => String(v ?? "").trim().toLowerCase());
    if (normalized.includes("name")) return i;
  }
  return -1;
}

/**
 * @param {Array<Array<unknown>>} rows raw worksheet rows
 * @returns {BundleRow[]}
 * @throws when no Name column is present or no product rows follow it
 */
export function extractBundleRows(rows) {
  const headerIndex = findHeaderRow(rows);
  if (headerIndex < 0) throw new Error('Could not find a "Name" column.');

  const headers = rows[headerIndex].map(v => String(v).trim());
  const col = name => headers.findIndex(h => h.toLowerCase() === name.toLowerCase());

  const skuCol = col("SKU");
  const nameCol = col("Name");
  const qtyCol = col("Net Qty");
  const royaltyCol = col("Royalty");

  const out = [];
  let lastProductRow = headerIndex;
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const rawName = rows[i][nameCol];
    if (!String(rawName ?? "").trim()) continue;
    // A total row whose label sits in the Name column ends the products; it
    // used to be read as a course called "Total royalty".
    if (isStatementTotalLabel(rawName)) break;

    lastProductRow = i;
    const { course, bundle } = splitName(rawName);
    out.push({
      SKU: skuCol >= 0 ? rows[i][skuCol] : "",
      CourseName: course,
      Bundle: bundle,
      NetQty: qtyCol >= 0 ? rows[i][qtyCol] : "",
      Royalty: royaltyCol >= 0 ? rows[i][royaltyCol] : ""
    });
  }

  if (!out.length) throw new Error("No product rows were found under the Name column.");

  // One separator for the whole sheet, so "1,234" reads the same way as the
  // sheet's unambiguous amounts.
  const decimal = detectDecimalSeparator(out.flatMap(r => [r.NetQty, r.Royalty]));
  out.forEach(r => { r.Decimal = decimal; });
  // The statement's own total, searched below the last product row only.
  out.statementTotal = findStatementTotal(rows, lastProductRow + 1, royaltyCol, decimal);
  return out;
}

/**
 * Groups rows by bundle, preserving first-seen order.
 * @returns {Map<string, BundleRow[]>}
 */
export function groupRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.Bundle)) groups.set(row.Bundle, []);
    groups.get(row.Bundle).push(row);
  }
  return groups;
}

/**
 * One entry per bundle, with royalty summed as the bundle price.
 * Non-numeric royalty/quantity cells are skipped rather than poisoning the sum.
 * Formatted amounts such as "£1,234.50" are read as numbers; Number() treated
 * them as non-numeric, so they were silently left out of the bundle price.
 * HasQty records whether the sheet gave any quantity for the bundle, so a sheet
 * without a Net Qty column is not mistaken for a net quantity of zero.
 * @returns {Array<{Bundle: string, BundlePrice: number, NetQty: number, HasQty: boolean}>}
 */
export function getBundleSummary(rows) {
  const map = new Map();

  for (const row of rows) {
    if (!map.has(row.Bundle)) {
      map.set(row.Bundle, { Bundle: row.Bundle, BundlePrice: 0, NetQty: 0, HasQty: false });
    }
    const item = map.get(row.Bundle);
    const royalty = parseAmount(row.Royalty, row.Decimal);
    const qty = parseAmount(row.NetQty, row.Decimal);
    if (royalty !== null) item.BundlePrice += royalty;
    if (qty !== null) {
      item.NetQty += qty;
      item.HasQty = true;
    }
  }

  return [...map.values()];
}

/** Sum of every bundle price. */
export const getTotalPrice = summary => summary.reduce((sum, r) => sum + r.BundlePrice, 0);
