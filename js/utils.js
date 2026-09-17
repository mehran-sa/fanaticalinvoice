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

/** Adds whole days to a YYYY-MM-DD string. */
export function plusDays(isoDate, days) {
  const d = new Date(isoDate + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------- colour */

export function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_ACCENT;
}

/* --------------------------------------------------------------- toast */

let toastTimer;

export function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), TOAST_MS);
}

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
