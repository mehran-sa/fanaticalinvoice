/**
 * Rows pasted from Excel or Google Sheets: copied cells arrive as text, one
 * row per line and a tab between cells. Each row becomes a line item: the
 * text cells make the description, and the numbers at the end are read as
 *   one number      the amount
 *   two numbers     quantity and amount (when the first is a whole number no
 *                   bigger than the second), otherwise rate and amount
 *   three or more   quantity, rate and amount (the last three)
 * A first row with no numbers that names columns ("Description", "Amount")
 * is a heading and is skipped. Pure: tested in tests/unit.test.mjs.
 */

import { parseAmount, detectDecimalSeparator } from "../utils.js";

const HEADING_WORDS = /^(description|item|items|course|name|details|qty|quantity|rate|price|unit price|amount|total|value|sku)$/i;

/** Whether the text looks like spreadsheet cells (several rows, or tabs). */
export const looksLikeCells = text => /\t/.test(String(text || ""));

/**
 * @param {string} text
 * @returns {Array<{description: string, quantity: number|null, rate: number|null, amount: number|null}>}
 */
export function parsePastedRows(text) {
  const rows = String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(line => line.split("\t").map(cell => cell.trim()))
    .filter(cells => cells.some(Boolean));
  if (!rows.length) return [];
  const decimal = detectDecimalSeparator(rows.flat());

  const parsed = rows.map(cells => {
    // Numbers are taken from the end of the row, stopping at the first text cell.
    const numbers = [];
    let end = cells.length;
    while (end > 0) {
      const cell = cells[end - 1];
      if (!cell) { end--; continue; }
      const value = parseAmount(cell, decimal);
      if (value === null) break;
      numbers.unshift(value);
      end--;
    }
    const description = cells.slice(0, end).filter(Boolean).join(" ");
    let quantity = null;
    let rate = null;
    let amount = null;
    if (numbers.length >= 3) {
      [quantity, rate, amount] = numbers.slice(-3);
    } else if (numbers.length === 2) {
      const [a, b] = numbers;
      if (Number.isInteger(a) && a > 0 && a <= Math.abs(b)) { quantity = a; amount = b; }
      else { rate = a; amount = b; }
    } else if (numbers.length === 1) {
      amount = numbers[0];
    }
    return { description, quantity, rate, amount, cells };
  });

  // A heading row: no numbers, and its cells are column names.
  const first = parsed[0];
  if (parsed.length > 1 && first.amount === null && first.cells.filter(Boolean).every(c => HEADING_WORDS.test(c))) parsed.shift();
  return parsed.map(({ cells, ...row }) => row);
}
