/**
 * Saved brand library: reusable seller identity and visual setup only.
 * Never stores client details, invoice numbers, dates or line items.
 */

import { STORAGE_KEYS, BRAND_FIELD_IDS, LEGACY_BRAND_COMPANY_FIELDS } from "../constants.js";
import { readJSON, writeJSON } from "./local-storage.js";
import { $ } from "../utils.js";

export function listBrands() {
  const list = readJSON(STORAGE_KEYS.brands, []);
  return Array.isArray(list) ? list : [];
}

export function writeBrands(list) {
  return writeJSON(STORAGE_KEYS.brands, list);
}

export function getBrand(index) {
  return listBrands()[index];
}

/**
 * Applies a stored brand record to the form.
 *
 * Handles both the current v2 shape ({ fields: {...} }) and pre-v2 records that
 * stored a nested company object plus top-level currency/template. Older saved
 * brands therefore keep working without a migration pass.
 *
 * @returns {string|undefined} the logo data URL, when the record carries one
 */
export function applyBrandRecord(record) {
  const data = JSON.parse(JSON.stringify(record || {}));

  if (data.fields && typeof data.fields === "object") {
    BRAND_FIELD_IDS.forEach(id => { if (id in data.fields) $(id).value = data.fields[id]; });
  }
  if (data.company && typeof data.company === "object") {
    Object.entries(LEGACY_BRAND_COMPANY_FIELDS).forEach(([id, key]) => {
      if (key in data.company) $(id).value = data.company[key] ?? "";
    });
  }
  if (typeof data.currency === "string") $("currency").value = data.currency;
  if (typeof data.template === "string") $("template").value = data.template;

  return typeof data.logo === "string" ? data.logo : undefined;
}
