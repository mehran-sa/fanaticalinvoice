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
 */

import { splitName } from "./name-splitter.js";

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
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const rawName = rows[i][nameCol];
    if (!String(rawName ?? "").trim()) continue;

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
 * @returns {Array<{Bundle: string, BundlePrice: number, NetQty: number}>}
 */
export function getBundleSummary(rows) {
  const map = new Map();

  for (const row of rows) {
    if (!map.has(row.Bundle)) {
      map.set(row.Bundle, { Bundle: row.Bundle, BundlePrice: 0, NetQty: 0 });
    }
    const item = map.get(row.Bundle);
    const royalty = Number(row.Royalty);
    const qty = Number(row.NetQty);
    if (Number.isFinite(royalty)) item.BundlePrice += royalty;
    if (Number.isFinite(qty)) item.NetQty += qty;
  }

  return [...map.values()];
}

/** Sum of every bundle price. */
export const getTotalPrice = summary => summary.reduce((sum, r) => sum + r.BundlePrice, 0);
