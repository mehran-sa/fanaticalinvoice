/**
 * Presentation formatting for invoice values: currency, dates, table cells.
 * Pure apart from reading the selected currency, which is passed in by default
 * so the functions can also be called with an explicit currency.
 */

import { fieldValue, num, esc } from "../utils.js";

/** Long-form date used by every template except One Education. */
export function dateFmt(value) {
  if (!value) return "\u2014";
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" })
    .format(new Date(value + "T00:00:00"));
}

/** DD/MM/YYYY, matching the One Education reference PDF. */
export function oneEducationDateFmt(value) {
  if (!value) return "\u2014";
  const [y, m, d] = String(value).split("-");
  return d && m && y ? `${d}/${m}/${y}` : dateFmt(value);
}

/** Currently selected invoice currency code. */
export const currentCurrency = () => fieldValue("currency");

/** Formats a number as currency, falling back to "CODE 0.00" for odd codes. */
export function money(value, currency = currentCurrency()) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 })
      .format(num(value));
  } catch {
    return currency + " " + num(value).toFixed(2);
  }
}

/** Drops a trailing ".00" from a fixed-2 rate, e.g. 20.00 -> "20". */
export const ratePercentText = rate => rate.toFixed(2).replace(/\.00$/, "");

/** Locale-grouped number with at most two decimals. */
export const decimalText = value => num(value).toLocaleString(undefined, { maximumFractionDigits: 2 });

export const alignClass = col => (col.align === "right" ? "right" : "");

/**
 * Renders one table cell. The result is inserted with innerHTML, so text is
 * escaped before newlines are converted to <br>.
 * @param {unknown} value
 * @param {{type: string}} col
 * @returns {string} HTML
 */
export function fmtCell(value, col) {
  if (col.type === "currency") return money(value);
  if (col.type === "number") return decimalText(value);
  if (col.type === "percentage") return ratePercentText(num(value)) + "%";
  if (col.type === "date") return dateFmt(value);
  return esc(value).replaceAll("\n", "<br>");
}
