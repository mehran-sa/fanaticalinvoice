/**
 * Maps raw spreadsheet rows onto line items using the current columns.
 *
 * Royalty statements are not clean tables: they carry preamble rows above the
 * header and footer/summary rows below the data, so the header row is detected
 * by keyword score and the data is cut at the first footer or trailing blank.
 */

import { num } from "../utils.js";
import { state, roleCol } from "../state.js";

/** Loose comparison key for header matching. */
export function norm(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ");
}

/** Header cells that indicate the real start of the data table. */
const HEADER_KEYWORDS = ["sku", "name", "description", "quantity", "qty", "net qty", "royalty", "amount"];

/** A row matching any of these ends the data. */
const FOOTER_STOP_WORDS = [
  "royalties are converted",
  "all values are exclusive",
  "please invoice for",
  "supplier id",
  "exchange rate",
  "total royalty",
  "subtotal"
];

/** Spreadsheet headings accepted for each default column key. */
const COLUMN_ALIASES = {
  sku: ["sku", "item code", "product code", "code"],
  description: ["description", "name", "item", "product", "course name"],
  quantity: ["quantity", "qty", "net qty", "net quantity"],
  rate: ["rate", "unit price", "price", "unit rate"],
  amount: ["amount", "total", "royalty", "line total"]
};

/** How many leading rows are searched for the header row. */
const HEADER_SEARCH_DEPTH = 100;

/** Picks the row that looks most like the table header. */
export const findHeaderRowIndex = rows => {
  let best = 0;
  let bestScore = -1;
  rows.slice(0, HEADER_SEARCH_DEPTH).forEach((row, i) => {
    const score = row.reduce((n, cell) => n + (HEADER_KEYWORDS.includes(norm(cell)) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
};

const isStopRow = row => {
  const text = row.map(v => norm(v)).join(" ");
  return FOOTER_STOP_WORDS.some(word => text.includes(word));
};

const isBlankRow = row => row.every(v => String(v ?? "").trim() === "");

/** Data rows between the header and the first footer / trailing blank row. */
export const collectDataRows = rows => {
  const clean = [];
  for (const row of rows) {
    if (isStopRow(row)) break;
    if (isBlankRow(row)) {
      // Blank rows before any data are padding; a blank row after data ends it.
      if (clean.length) break;
      continue;
    }
    clean.push(row);
  }
  return clean;
};

/**
 * @param {string[][]} rows
 * @returns {Array<Record<string, string|number>>}
 */
export function mapRows(rows) {
  if (!rows.length) return [];

  const headerIndex = findHeaderRowIndex(rows);
  const headers = rows[headerIndex].map(h => String(h ?? "").trim());
  const dataRows = collectDataRows(rows.slice(headerIndex + 1));

  return dataRows.map(row => {
    const source = {};
    headers.forEach((h, i) => { source[h] = row[i]; });

    const item = {};
    state.columns.forEach(col => {
      const candidates = [norm(col.label), norm(col.key), ...(COLUMN_ALIASES[col.key] || [])];
      const match = Object.keys(source).find(k => candidates.includes(norm(k)));
      if (match !== undefined) item[col.key] = source[match];
    });

    const quantityCol = roleCol("quantity");
    const rateCol = roleCol("rate");
    const amountCol = roleCol("amount");

    if (quantityCol && item[quantityCol.key] === "") item[quantityCol.key] = 1;

    // Statements often give a line total but no unit rate; back-derive it.
    if (rateCol && amountCol && num(item[rateCol.key]) === 0 && num(item[amountCol.key])) {
      item[rateCol.key] = num(item[amountCol.key]) / Math.max(1, num(item[quantityCol?.key] || 1));
    }

    return Object.values(item).some(v => String(v ?? "").trim()) ? item : null;
  }).filter(Boolean);
}
