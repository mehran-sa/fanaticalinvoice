/**
 * Presentation formatting for invoice values: currency, dates, table cells.
 * Pure apart from reading the selected currency, which is passed in by default
 * so the functions can also be called with an explicit currency.
 */

import { fieldValue, num, esc } from "../utils.js";

/**
 * Long-form date used by every template except One Education.
 *
 * Text that is not a YYYY-MM-DD date (for example "01/02/2026" imported into a
 * Date column) is returned unchanged. Formatting it threw a RangeError, which
 * stopped the whole preview rendering.
 */
export function dateFmt(value) {
  if (!value) return "\u2014";
  const date = new Date(value + "T00:00:00");
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "long", year: "numeric" })
    .format(date);
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
/**
 * A unit price: 2 decimals, or up to 4 when the rate has them. A royalty rate
 * of 0.2331 printed as "£0.23" did not multiply out to the line amount.
 */
export function unitMoney(value, currency = currentCurrency()) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 4 })
      .format(num(value));
  } catch {
    return currency + " " + String(Math.round(num(value) * 1e4) / 1e4);
  }
}

export function fmtCell(value, col) {
  if (col.type === "currency" && col.role === "rate") return unitMoney(value);
  if (col.type === "currency") return money(value);
  if (col.type === "number") return decimalText(value);
  if (col.type === "percentage") return ratePercentText(num(value)) + "%";
  // dateFmt can return the user's own text, so it is escaped like any text cell.
  if (col.type === "date") return esc(dateFmt(value));
  return esc(value).replaceAll("\n", "<br>");
}
