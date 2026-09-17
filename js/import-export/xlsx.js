/**
 * Excel import. The parser is loaded lazily from a CDN only when an .xlsx/.xls
 * file is chosen, so CSV import and the rest of the app need no network access.
 */

import { XLSX_CDN } from "../constants.js";

let loader = null;

export function ensureXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = XLSX_CDN;
    script.onload = () => resolve(window.XLSX);
    script.onerror = () => {
      loader = null;
      reject(Error("Excel parser could not load. Use CSV or connect to the internet."));
    };
    document.head.appendChild(script);
  });
  return loader;
}

/** Reads the first worksheet of a workbook as an array of rows. */
export async function readWorkbookRows(file) {
  const XLSX = await ensureXLSX();
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
}
