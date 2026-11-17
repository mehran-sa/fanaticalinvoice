/**
 * Saved template library: named full-invoice snapshots.
 * Record shape is unchanged: { name, data } where data is a serialize() result.
 */

import { STORAGE_KEYS } from "../constants.js";
import { readJSON, writeJSON } from "./local-storage.js";

export function listTemplates() {
  const list = readJSON(STORAGE_KEYS.templates, []);
  return Array.isArray(list) ? list : [];
}

export function writeTemplates(list) {
  return writeJSON(STORAGE_KEYS.templates, list);
}

export function getTemplate(index) {
  return listTemplates()[index];
}

/** Case-insensitive name lookup, matching the original save behaviour. */
export function findTemplateIndexByName(list, name) {
  return list.findIndex(x => String(x.name || "").trim().toLocaleLowerCase() === name.toLocaleLowerCase());
}
