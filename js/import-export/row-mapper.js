/**
 * Maps raw spreadsheet rows onto line items using the current columns.
 *
 * Royalty statements are not clean tables: they carry preamble rows above the
 * header and footer/summary rows below the data, so the header row is detected
 * by keyword score and the data is cut at the first footer or trailing blank.
 */

import { num, parseAmount, detectDecimalSeparator } from "../utils.js";
import { NUMERIC_COLUMN_TYPES, FIXED_AMOUNT_KEY } from "../constants.js";
import { state, roleCol } from "../state.js";
import { findStatementTotal } from "./statement-total.js";

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
export const collectDataRows = rows => dataRowRange(rows).rows;

/** The data rows plus the index (within `rows`) where the data stopped. */
export const dataRowRange = rows => {
  const clean = [];
  let i = 0;
  for (; i < rows.length; i++) {
    const row = rows[i];
    if (isStopRow(row)) break;
    if (isBlankRow(row)) {
      // Blank rows before any data are padding; a blank row after data ends it.
      if (clean.length) break;
      continue;
    }
    clean.push(row);
  }
  return { rows: clean, end: i };
};

/**
 * @param {string[][]} rows
 * @returns {Array<Record<string, string|number>>}
 */
export function mapRows(rows) {
  return readStatementRows(rows).items;
}

/**
 * Maps rows onto line items and also reads the statement's own total row.
 * @returns {{items: Array<Record<string, string|number>>, statementTotal: {label: string, value: number}|null}}
 */
export function readStatementRows(rows) {
  if (!rows.length) return { items: [], statementTotal: null };

  const headerIndex = findHeaderRowIndex(rows);
  const headers = rows[headerIndex].map(h => String(h ?? "").trim());
  const range = dataRowRange(rows.slice(headerIndex + 1));
  const dataRows = range.rows;

  // Which sheet column (by index) feeds each invoice column. The first header
  // that matches wins, as before.
  const mapping = state.columns.map(col => {
    const candidates = [norm(col.label), norm(col.key), ...(COLUMN_ALIASES[col.key] || [])];
    return { col, index: headers.findIndex(h => candidates.includes(norm(h))) };
  }).filter(m => m.index !== -1);

  // One decimal separator for the whole sheet, judged from its numeric cells,
  // so "1,234" is read the same way as the sheet's unambiguous values.
  const numeric = mapping.filter(m => NUMERIC_COLUMN_TYPES.includes(m.col.type));
  const decimal = detectDecimalSeparator(dataRows.flatMap(row => numeric.map(m => row[m.index])));

  const amountIndex = mapping.find(m => m.col.role === "amount")?.index ?? -1;
  // Searched only below the data, so a line item named "Total ..." is never
  // mistaken for the statement's total.
  const statementTotal = findStatementTotal(rows, headerIndex + 1 + range.end, amountIndex, decimal);

  const items = dataRows.map(row => {
    const item = {};
    mapping.forEach(({ col, index }) => {
      let value = row[index];
      // Numeric cells are stored as numbers, the same as values typed in the
      // editor. Text such as "1,234.50" or "£99.99" used to be stored as-is and
      // then counted as 0. Text that is not a number is kept unchanged.
      if (NUMERIC_COLUMN_TYPES.includes(col.type)) {
        const parsed = parseAmount(value, decimal);
        if (parsed !== null) value = parsed;
      }
      item[col.key] = value;
    });

    // Decided before any defaults are filled in, so a row with nothing that
    // matches a column is still dropped rather than becoming a blank line.
    if (!Object.values(item).some(v => String(v ?? "").trim())) return null;

    const quantityCol = roleCol("quantity");
    const rateCol = roleCol("rate");
    const amountCol = roleCol("amount");

    // A blank quantity cell, or a sheet with no quantity column at all, means
    // one unit. Without the second case every line of a statement that lists
    // only a royalty/amount was calculated as 0 x rate = 0.
    if (quantityCol && String(item[quantityCol.key] ?? "").trim() === "") item[quantityCol.key] = 1;

    // Statements often give a line total but no unit rate; back-derive it so
    // that quantity x rate reproduces the line total. The divisor is the real
    // quantity: Math.max(1, quantity) flipped the sign of refund lines and
    // halved lines with a fractional quantity.
    if (rateCol && amountCol && num(item[rateCol.key]) === 0 && num(item[amountCol.key])) {
      item[rateCol.key] = num(item[amountCol.key]) / (num(item[quantityCol?.key]) || 1);
    }

    // Quantity 0 with a non-zero line total (a net-zero sales line that still
    // carries an adjustment): quantity x rate would give 0, so the statement's
    // amount is kept as the line amount.
    if (quantityCol && amountCol && num(item[quantityCol.key]) === 0 &&
        String(item[quantityCol.key]).trim() !== "" && num(item[amountCol.key])) {
      item[FIXED_AMOUNT_KEY] = num(item[amountCol.key]);
    }

    return item;
  }).filter(Boolean);
  return { items, statementTotal };
}
