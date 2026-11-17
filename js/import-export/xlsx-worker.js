/**
 * Excel parsing worker.
 *
 * SheetJS runs here, in a separate thread with its own global scope, rather
 * than in the page. Whatever a crafted spreadsheet does to the parser's objects
 * (for example the prototype pollution fixed in SheetJS 0.19.3) stays inside
 * this worker, and a parse that hangs can be stopped by terminating the worker.
 * Only plain rows of text, numbers and booleans are sent back.
 *
 * This is a classic (non-module) worker so that importScripts() can load the
 * bundled parser. It makes no network requests.
 */

/* global importScripts, XLSX */
if (typeof XLSX === "undefined") importScripts("../vendor/xlsx.full.min.js");

const toCell = value => {
  if (typeof value === "number") return Number.isFinite(value) ? value : "";
  if (typeof value === "string" || typeof value === "boolean") return value;
  return value === null || value === undefined ? "" : String(value);
};

self.onmessage = event => {
  const { buffer } = event.data || {};
  try {
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) {
      self.postMessage({ error: "noSheet" });
      return;
    }
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    const rows = raw.map(row => (Array.isArray(row) ? row.map(toCell) : []));
    self.postMessage({ rows });
  } catch (err) {
    self.postMessage({ error: "unreadable", detail: String(err && err.message || err) });
  }
};
