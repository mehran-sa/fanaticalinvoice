/**
 * Generic helpers shared across the application: DOM lookup, escaping, number
 * and colour handling, dates, and the toast notifier.
 *
 * Depends only on constants. Never imports UI or domain modules.
 */

import { TOAST_MS, DEFAULT_ACCENT } from "./constants.js";

/* ------------------------------------------------------------------ DOM */

export const $ = id => document.getElementById(id);
export const qs = selector => document.querySelector(selector);
export const qsa = selector => [...document.querySelectorAll(selector)];

/** Raw value of a form control. */
export const fieldValue = id => $(id).value;

/**
 * Writes a stored value into a form control without letting bad data blank it.
 *
 * A <select> silently becomes "" when given a value it has no option for, and a
 * date input does the same for anything that is not YYYY-MM-DD. Such values are
 * ignored and the control keeps its current value.
 * @returns {boolean} whether the value was applied
 */
export function setFieldValue(id, value) {
  const el = $(id);
  if (!el) return false;
  const text = value === null || value === undefined ? "" : String(value);
  if (el.tagName === "SELECT" && ![...el.options].some(o => o.value === text)) return false;
  if (el.type === "date" && text !== "" && !isIsoDate(text)) return false;
  if (el.type === "number" && text !== "" && !Number.isFinite(Number(text))) return false;
  el.value = text;
  return true;
}
/** Trimmed value of a form control. */
export const trimmedField = id => String($(id).value).trim();
/** Trimmed value, or a fallback when the field is empty. */
export const fieldOr = (id, fallback) => trimmedField(id) || fallback;

/** Sets textContent when the element exists. */
export const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };

/** Toggles the shared "hidden in this template" class on an element. */
export const toggleSection = (el, visible) => {
  if (el) el.classList.toggle("section-hidden", !visible);
};

/* ------------------------------------------------------------- numbers */

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/** Coerces anything to a finite number, defaulting to 0. */
export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Rounds a money value to two decimal places, half away from zero.
 *
 * The exponent-string form avoids binary floating-point error at the halfway
 * point: 1.005 * 100 is 100.49999999999999 in floating point, but "1.005e2" is
 * exactly 100.5. Every currency the app offers uses two minor-unit digits.
 */
export function roundMoney(value) {
  const n = num(value);
  if (n === 0) return 0;
  const magnitude = Math.abs(n);
  const rounded = Number(Math.round(Number(magnitude + "e2")) + "e-2");
  // Exponential notation (very large or tiny values) cannot use the string
  // shift above; fall back to plain arithmetic, which is exact enough there.
  const result = Number.isFinite(rounded) ? rounded : Math.round(magnitude * 100) / 100;
  return n < 0 ? -result : result;
}

/** Strips currency marks, spaces and apostrophes; returns [text, negative]. */
function stripAmountText(value) {
  let text = value.trim();
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1).trim(); }
  // Currency codes and symbols, spaces (including non-breaking) and the
  // apostrophe used as a thousands separator in some locales.
  text = text.replace(/^[A-Za-z]{3}(?=[\s\d.,+-])/, "").replace(/[\s\u00a0\u202f'£$€৳¥₹]|A\$|C\$/g, "");
  if (/^-/.test(text)) { negative = !negative; text = text.slice(1); }
  else if (/^\+/.test(text)) text = text.slice(1);
  return [text, negative];
}

const THOUSANDS_COMMA = /^\d{1,3}(,\d{3})+$/;
const THOUSANDS_DOT = /^\d{1,3}(\.\d{3})+$/;

/**
 * The decimal separator of the viewer's locale ("." or ","), used only when a
 * file gives no unambiguous evidence of its own.
 */
export function localeDecimalSeparator() {
  try {
    const part = new Intl.NumberFormat().formatToParts(1.5).find(p => p.type === "decimal");
    return part && part.value === "," ? "," : ".";
  } catch {
    return ".";
  }
}

/**
 * Works out whether a set of amounts uses "." or "," as the decimal separator.
 *
 * "12,50", "1.234,56" count as decimal comma; "12.50", "1,234.50" as decimal
 * point. Values like "1,234" or "1.234" could be either and are not counted.
 * The majority wins; with no evidence the locale's separator is used.
 * @param {Iterable<unknown>} values
 * @param {string} [fallback]
 * @returns {"."|","}
 */
export function detectDecimalSeparator(values, fallback = localeDecimalSeparator()) {
  let dot = 0;
  let comma = 0;
  for (const value of values) {
    if (typeof value !== "string") continue;
    const [text] = stripAmountText(value);
    if (!/^[\d.,]+$/.test(text)) continue;
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    if (lastComma !== -1 && lastDot !== -1) {
      if (lastDot > lastComma) dot++; else comma++;
    } else if (lastComma !== -1) {
      if (!THOUSANDS_COMMA.test(text)) comma++;
    } else if (lastDot !== -1) {
      if (!THOUSANDS_DOT.test(text)) dot++;
    }
  }
  if (dot === comma) return fallback === "," ? "," : ".";
  return comma > dot ? "," : ".";
}

/**
 * Parses an amount typed into a spreadsheet or invoice cell.
 *
 * Accepts numbers and strings such as "1,234.50", "£99.99", "$ 12", "(5.00)"
 * (accounting negative), "1 234,50" and "12,5". Returns null when the text is
 * not a recognisable number, so callers can keep the original value instead of
 * silently turning it into zero.
 *
 * @param {unknown} value
 * @param {"."|","} [decimal] the file's decimal separator (see
 *   detectDecimalSeparator). When given, the other mark is treated as a
 *   thousands separator, so "1,234" reads as 1234 with "." and 1.234 with ",".
 *   When omitted, each value is judged on its own, and "1,234" is 1234.
 * @returns {number|null}
 */
export function parseAmount(value, decimal) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  if (!value.trim()) return null;

  let [text, negative] = stripAmountText(value);
  if (!/^[\d.,]+$/.test(text) || !/\d/.test(text)) return null;

  if (decimal === "." || decimal === ",") {
    const group = decimal === "." ? "," : ".";
    if (text.split(decimal).length > 2) return null;
    const [whole, fraction] = text.split(decimal);
    // Grouping marks must sit in groups of three ("1,234,567").
    if (whole.includes(group) && !(group === "," ? THOUSANDS_COMMA : THOUSANDS_DOT).test(whole)) return null;
    if (fraction !== undefined && /[.,]/.test(fraction)) return null;
    text = whole.split(group).join("") + (fraction !== undefined ? "." + fraction : "");
  } else {
    const lastComma = text.lastIndexOf(",");
    const lastDot = text.lastIndexOf(".");
    if (lastComma !== -1 && lastDot !== -1) {
      // Both present: whichever comes last is the decimal separator.
      text = lastDot > lastComma
        ? text.replace(/,/g, "")
        : text.replace(/\./g, "").replace(",", ".");
    } else if (lastComma !== -1) {
      // Commas only: "1,234" / "1,234,567" are thousands groups, "12,5" is a
      // decimal comma.
      text = THOUSANDS_COMMA.test(text) ? text.replace(/,/g, "") : text.replace(",", ".");
    }
    if ((text.match(/\./g) || []).length > 1) {
      // "1.234.567" style thousands grouping.
      if (!THOUSANDS_DOT.test(text)) return null;
      text = text.replace(/\./g, "");
    }
  }

  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/* --------------------------------------------------------------- text */

/** Escapes text for safe interpolation into innerHTML. */
export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Builds a newline-separated block from [fieldId, prefix] pairs, skipping any
 * field that is empty.
 * @param {Array<[string, string]>} rows
 */
export const joinMetaLines = rows => rows
  .map(([id, prefix]) => {
    const value = trimmedField(id);
    return value ? prefix + value : "";
  })
  .filter(Boolean)
  .join("\n");

/* --------------------------------------------------------------- dates */

/** Today's date as YYYY-MM-DD in the viewer's local timezone. */
export function today() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d - offset * 60000).toISOString().slice(0, 10);
}

/** Formats a Date as YYYY-MM-DD using its local calendar fields. */
export function localIsoDate(date) {
  const pad = n => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Adds whole days to a YYYY-MM-DD string.
 *
 * The result is read back from the local calendar fields. Converting through
 * toISOString() (UTC) moved the date back one day in every timezone ahead of
 * UTC, so a 14-day due date came out as 13 days.
 */
export function plusDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  d.setDate(d.getDate() + days);
  return localIsoDate(d);
}

/** True for a well-formed YYYY-MM-DD string that names a real calendar date. */
export function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return false;
  const d = new Date(value + "T00:00:00");
  return !Number.isNaN(d.getTime()) && localIsoDate(d) === value;
}

/* -------------------------------------------------------------- colour */

export function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_ACCENT;
}

/* --------------------------------------------------------------- toast */

let toastTimer;

export function toast(message, { error = false } = {}) {
  const el = $("toast");
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = "";
  const text = document.createElement("span");
  text.textContent = message;
  el.appendChild(text);
  el.classList.toggle("error", error);
  // Errors are announced at once and stay until dismissed; other messages fade.
  el.setAttribute("role", error ? "alert" : "status");
  el.classList.add("show");
  if (error) {
    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-close";
    close.setAttribute("aria-label", "Dismiss message");
    close.textContent = "\u00d7";
    close.onclick = () => el.classList.remove("show");
    el.appendChild(close);
    return;
  }
  // Longer messages (import corrections) stay up long enough to read.
  const duration = Math.min(8000, Math.max(TOAST_MS, String(message).length * 45));
  toastTimer = setTimeout(() => el.classList.remove("show"), duration);
}

/** A problem the user needs to see: stays on screen until dismissed. */
export const toastError = message => toast(message, { error: true });

/* ------------------------------------------------------------ download */

/** Triggers a client-side file download of a text payload. */
export function download(name, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
