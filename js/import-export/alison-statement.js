/**
 * Reads an Alison payout statement pasted as text, for example:
 *
 *   Q2-2026 Payout
 *   Opening Balance: €29,000.00
 *   Q2-2026 Earnings: €8,200.77
 *   *Less Publishing Costs Recouped: €0.00
 *   Closing Balance: €37,200.77
 *   Proposed Payment: €37,200.77
 *
 * Each "label: amount" line is sorted into what it is:
 *   opening     the balance carried from earlier quarters
 *   earnings    the quarter's earnings (the line for "only the quarter")
 *   deduction   a "Less ..." line, taken off (a positive amount becomes negative)
 *   other       any other amount, added as a line too
 *   total       Closing Balance, Proposed Payment, Total, Amount due: these
 *               repeat the sum of the lines, so they are never added as lines
 *               (that would count the total twice); they are used to check
 * Pure: tested in tests/quarters.test.mjs.
 */

import { parseAmount, detectDecimalSeparator, roundMoney } from "../utils.js";
import { normalizePeriod } from "../invoice/periods.js";

const LINE = /^\s*[*•\-–]?\s*([^:]{2,80}?)\s*[:=]\s*([-+(]?\s*(?:[A-Z]{3}\s*)?[£$€৳]?\s*[-+]?[\d.,\s ']+\)?)\s*(?:[A-Z]{3})?\s*$/;
const CURRENCY_SIGNS = { "€": "EUR", "£": "GBP", "$": "USD", "৳": "BDT" };

const kindOf = label => {
  if (/\b(closing balance|proposed payment|payment due|amount due|balance due|total( due| payable)?|grand total|net payable)\b/i.test(label)) return "total";
  if (/\bopening balance\b|\bbrought forward\b|\bcarried forward\b/i.test(label)) return "opening";
  if (/^\s*less\b|\b(recouped|deduct(ed|ion)?|withheld|fee|fees|charges?)\b/i.test(label)) return "deduction";
  if (/\b(earnings|royalt(y|ies)|revenue|commission|payout for)\b/i.test(label)) return "earnings";
  return "other";
};

/** Whether a pasted text looks like an Alison statement (and not spreadsheet cells). */
export function looksLikeStatement(text) {
  const t = String(text || "");
  if (/\t/.test(t)) return false;
  const amountLines = t.split(/\r?\n/).filter(l => LINE.test(l)).length;
  return amountLines >= 2 && /(opening balance|earnings|closing balance|proposed payment)/i.test(t);
}

/**
 * @param {string} text
 * @returns {{period: string, title: string, currency: string,
 *   rows: Array<{label: string, amount: number, kind: string}>,
 *   lines: Array<{label: string, amount: number, kind: string}>,
 *   quarter: {label: string, amount: number}|null,
 *   check: {label: string, amount: number}|null,
 *   sum: number}}
 *   rows: every amount line read; lines: those that become invoice lines
 *   ("all"); quarter: the earnings line; check: the statement's own total
 *   (Proposed Payment, else Closing Balance); sum: the lines added up.
 */
export function parseAlisonStatement(text) {
  const raw = String(text || "").replace(/\r\n?/g, "\n").split("\n").map(l => l.replace(/ /g, " ").trim()).filter(Boolean);
  const amounts = raw.map(l => (LINE.exec(l) || [])[2]).filter(Boolean);
  const decimal = detectDecimalSeparator(amounts, ".");
  let title = "";
  let currency = "";
  const rows = [];
  for (const line of raw) {
    const m = LINE.exec(line);
    if (!m) {
      if (!title && !rows.length) title = line.replace(/\s+/g, " ");
      continue;
    }
    const label = m[1].replace(/^[*•\-–\s]+/, "").replace(/\s+/g, " ").trim();
    let amount = parseAmount(m[2].replace(/\s+/g, ""), decimal);
    if (amount === null) continue;
    const sign = (m[2].match(/[£$€৳]/) || [])[0];
    const code = (m[2].match(/[A-Z]{3}/) || [])[0];
    if (!currency) currency = CURRENCY_SIGNS[sign] || code || "";
    const kind = kindOf(label);
    if (kind === "deduction" && amount > 0) amount = -amount;
    rows.push({ label, amount: roundMoney(amount), kind });
  }
  const period = normalizePeriod(title) || rows.map(r => normalizePeriod(r.label)).find(Boolean) || "";
  const lines = rows.filter(r => r.kind !== "total");
  const quarter = rows.find(r => r.kind === "earnings" && (!period || normalizePeriod(r.label) === period || !normalizePeriod(r.label)))
    || rows.find(r => r.kind === "earnings") || null;
  const totals = rows.filter(r => r.kind === "total");
  const check = totals.find(r => /proposed payment|payment due|amount due/i.test(r.label)) || totals.find(r => /closing balance/i.test(r.label)) || totals[0] || null;
  const sum = roundMoney(lines.reduce((s, r) => s + r.amount, 0));
  return { period, title, currency, rows, lines, quarter, check, sum };
}
