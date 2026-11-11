/**
 * Finds the total a statement states for itself, so an import can be checked.
 *
 * Royalty statements end with rows such as "Total royalty  40.49" or
 * "Please invoice for £40.49". The importers stop reading line items at those
 * rows; this module reads the figure from them instead.
 *
 * Labels are tried in order of how directly they state the amount owed.
 */

import { parseAmount, roundMoney } from "../utils.js";

const LABELS = [
  { re: /^please invoice for\b/, label: "Please invoice for" },
  { re: /^total royalt(y|ies)\b/, label: "Total royalty" },
  { re: /^grand total\b/, label: "Grand total" },
  { re: /^total( amount| due| payable)?\b/, label: "Total" }
];

const norm = v => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** True for a statement total label such as "Total royalty" or "Grand total". */
export const isStatementTotalLabel = text => LABELS.some(({ re }) => re.test(norm(text)));

/**
 * @param {unknown[][]} rows      raw sheet rows
 * @param {number} startIndex     first row after the header
 * @param {number} valueIndex     column holding line amounts, or -1
 * @param {"."|","} decimal       the sheet's decimal separator
 * @returns {{label: string, value: number} | null}
 */
export function findStatementTotal(rows, startIndex, valueIndex, decimal) {
  for (const { re, label } of LABELS) {
    for (let i = Math.max(0, startIndex); i < rows.length; i++) {
      const row = Array.isArray(rows[i]) ? rows[i] : [];
      const labelCell = row.findIndex(cell => re.test(norm(cell)));
      if (labelCell === -1) continue;

      // 1. The amount column; 2. the last number in the row after the label;
      // 3. a number written inside the label itself ("... for £40.49").
      const candidates = [];
      if (valueIndex >= 0) candidates.push(row[valueIndex]);
      for (let c = row.length - 1; c > labelCell; c--) candidates.push(row[c]);
      for (const cell of candidates) {
        const value = parseAmount(cell, decimal);
        if (value !== null && String(cell).trim() !== "") return { label, value: roundMoney(value) };
      }
      const inside = String(row[labelCell]).match(/[-(]?[£$€]?\s?\d[\d.,]*\)?\s*$/);
      if (inside) {
        const value = parseAmount(inside[0].trim(), decimal);
        if (value !== null) return { label, value: roundMoney(value) };
      }
    }
  }
  return null;
}

/**
 * Compares the imported lines with the statement's own total.
 * @returns {{status: "match"|"mismatch"|"none", statement?: {label, value}, imported: number, difference?: number}}
 */
export function compareWithStatement(statement, importedTotal) {
  const imported = roundMoney(importedTotal);
  if (!statement) return { status: "none", imported };
  const difference = roundMoney(imported - statement.value);
  return { status: Math.abs(difference) < 0.005 ? "match" : "mismatch", statement, imported, difference };
}
