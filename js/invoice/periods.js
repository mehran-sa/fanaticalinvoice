/**
 * Quarters, statuses and file names: the plain rules behind the invoices
 * board, "Start next quarter" and Check and export. No DOM, so they are unit
 * tested directly (tests/unit.test.mjs).
 *
 * A period is a calendar quarter written "Q3-2026". Academies invoice Alison
 * once a quarter, after it ends, so an invoice dated in November is for Q3.
 */

const QUARTER_TEXT = /\b([Qq])([1-4])(\s*[-,/]?\s*(?:of\s+)?)((?:19|20)\d\d)\b/g;

/** "Q3-2026" from a quarter and a year. */
export const periodLabel = (quarter, year) => `Q${quarter}-${year}`;

/** {quarter, year} from "Q3-2026", "Q3 2026", "Q3, 2026" or "Q3 of 2026"; null otherwise. */
export function parsePeriod(text) {
  QUARTER_TEXT.lastIndex = 0;
  const match = QUARTER_TEXT.exec(String(text ?? ""));
  QUARTER_TEXT.lastIndex = 0;
  return match ? { quarter: Number(match[2]), year: Number(match[4]) } : null;
}

/** The canonical label for any way of writing a quarter, or "". */
export function normalizePeriod(text) {
  const p = parsePeriod(text);
  return p ? periodLabel(p.quarter, p.year) : "";
}

/** The first quarter mentioned in any of the texts, or "". */
export function findPeriod(texts) {
  for (const text of texts) {
    const found = normalizePeriod(text);
    if (found) return found;
  }
  return "";
}

/** The quarter before the one the date falls in: what an invoice on that date is for. */
export function periodForDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(isoDate ?? ""));
  if (!match) return "";
  const year = Number(match[1]);
  const quarter = Math.ceil(Number(match[2]) / 3);
  return quarter === 1 ? periodLabel(4, year - 1) : periodLabel(quarter - 1, year);
}

/** The quarter `steps` after (or before, when negative) the given one. */
export function shiftPeriod(label, steps) {
  const p = parsePeriod(label);
  if (!p) return "";
  const index = p.year * 4 + (p.quarter - 1) + steps;
  return periodLabel((index % 4) + 1, Math.floor(index / 4));
}

/** Sort order: newer quarters first. Unknown labels sort last. */
export function comparePeriodsDesc(a, b) {
  const pa = parsePeriod(a);
  const pb = parsePeriod(b);
  if (!pa || !pb) return pa ? -1 : pb ? 1 : 0;
  return (pb.year * 4 + pb.quarter) - (pa.year * 4 + pa.quarter);
}

/**
 * Rewrites every quarter mentioned in the text as the target quarter, keeping
 * how it was written: "Q3-2026 earnings" -> "Q4-2026 earnings",
 * "Q3, 2026 payout" -> "Q4, 2026 payout".
 */
export function rollPeriodText(text, target) {
  const to = parsePeriod(target);
  if (!to || typeof text !== "string") return text;
  return text.replace(QUARTER_TEXT, (_, q, _n, sep) => `${q}${to.quarter}${sep}${to.year}`);
}

/**
 * The quarter an invoice is for: the period set on it; otherwise the first
 * quarter mentioned in its lines, notes, reference or number; otherwise the
 * quarter before its date.
 * @param {{fields?: object, items?: object[]}} snapshot
 */
export function invoicePeriod(snapshot) {
  const fields = snapshot?.fields || {};
  const set = normalizePeriod(fields.invoicePeriod);
  if (set) return set;
  const texts = [];
  for (const item of Array.isArray(snapshot?.items) ? snapshot.items : []) {
    for (const value of Object.values(item || {})) if (typeof value === "string") texts.push(value);
  }
  texts.push(fields.notes, fields.reference, fields.invoiceNumber);
  return findPeriod(texts) || periodForDate(fields.invoiceDate);
}

/* ------------------------------------------------------------ status */

/**
 * An invoice is a draft or issued. The app does not track payments, so there
 * is no Paid or Overdue: an invoice saved as "paid" by 2.14 to 2.15.3 counts
 * as issued, as do invoices saved before 2.14.0 (which have no status).
 */
export const STATUSES = ["draft", "issued"];
export const STATUS_LABELS = { notstarted: "Not started", draft: "Draft", issued: "Issued" };

/** A stored status, as one of STATUSES. */
export const storedStatus = value => (value === "draft" ? "draft" : "issued");

/**
 * The status the app shows (kept as a function so callers need not change).
 * @param {{status?: string}} entry
 */
export function effectiveStatus(entry) {
  return storedStatus(entry?.status);
}

/* ---------------------------------------------------------- file name */

const slug = text => String(text ?? "")
  .replace(/&/g, " and ")
  .normalize("NFKD").replace(/[̀-ͯ]/g, "")
  .replace(/[^A-Za-z0-9.]+/g, "-")
  .replace(/^-+|-+$/g, "");

/**
 * The PDF's file name (without ".pdf"): "Janets-Alison_2026-11005_Q3-2026",
 * or just the number with style "number".
 */
export function pdfFileName({ academy = "", number = "", period = "" }, style = "academy") {
  const n = slug(number) || "Invoice";
  if (style === "number") return n;
  return [slug(academy), n, slug(period)].filter(Boolean).join("_");
}

/* ------------------------------------------------------ total checks */

const cents = value => Math.round(Number(value || 0) * 100);

/**
 * Lines whose amount equals the sum of all the other lines: usually a
 * "Closing balance" or "Total" typed as a line, which counts the total twice.
 * A line is flagged when at least two other lines carry an amount, or when
 * its text says it is a total or balance.
 * @param {Array<{description: string, amount: number}>} lines
 * @returns {number[]} indexes of such lines
 */
export function linesRepeatingTotal(lines) {
  const amounts = lines.map(l => cents(l.amount));
  const sum = amounts.reduce((a, b) => a + b, 0);
  const found = [];
  amounts.forEach((amount, i) => {
    if (!amount) return;
    const others = sum - amount;
    if (others !== amount) return;
    const nonZeroOthers = amounts.filter((a, j) => j !== i && a).length;
    const saysTotal = /\b(total|closing balance|balance due|amount due)\b/i.test(lines[i].description || "");
    if (nonZeroOthers >= 2 || (nonZeroOthers >= 1 && saysTotal)) found.push(i);
  });
  return found;
}
