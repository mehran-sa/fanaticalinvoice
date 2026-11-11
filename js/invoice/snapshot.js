/**
 * Validates and normalises invoice snapshots before they reach application
 * state.
 *
 * Snapshots arrive from four places: the autosave, imported JSON files, the
 * saved template library and undo history. Only the first three can contain
 * damaged or hostile data, but running everything through one path keeps the
 * rules in one place.
 *
 * The rules repair rather than reject wherever a safe repair exists, so an
 * older or slightly damaged file still opens. The shape that comes out is the
 * same shape serialize() writes, so nothing is migrated in storage until the
 * next normal autosave.
 *
 * What is enforced:
 *  - the payload must be a plain object (anything else is rejected outright)
 *  - field values are strings
 *  - the logo is an embedded image (data:image/...), never a remote address;
 *    a remote URL would make the browser contact another server
 *  - columns have a safe, unique key, a known type/alignment/role, a numeric
 *    width, and each calculation role is held by at most one column
 *  - line items are plain objects of text/number values; numeric columns hold
 *    numbers when the text is a recognisable amount such as "1,234.50"
 *  - section toggles are booleans
 */

import { FIELD_IDS, NUMERIC_COLUMN_TYPES, SECTION_DEFS, FIXED_AMOUNT_KEY } from "../constants.js";
import { parseAmount, detectDecimalSeparator } from "../utils.js";

const COLUMN_TYPES = ["text", "number", "currency", "percentage", "date"];
const COLUMN_ALIGNS = ["left", "right", "center"];
const COLUMN_ROLES = ["none", "quantity", "rate", "amount"];
/** Keys that would reach Object.prototype when used as a property name. */
const UNSAFE_KEYS = ["__proto__", "constructor", "prototype"];
const WIDTH = { min: 5, max: 100, fallback: 10 };

/** Embedded raster or SVG images only. */
const LOGO_PATTERN = /^data:image\/(png|jpe?g|webp|gif|svg\+xml)[;,]/i;

const isPlainObject = value =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/** True when the value is an embedded image that is safe to display. */
export const isSafeLogo = value => typeof value === "string" && LOGO_PATTERN.test(value);

const cleanText = value => (value === null || value === undefined ? "" : String(value));

function cleanKey(value, index, used) {
  let key = typeof value === "string" ? value.trim() : "";
  // The fixed-amount property is reserved for line items, never a column.
  if (!key || UNSAFE_KEYS.includes(key) || key === FIXED_AMOUNT_KEY) key = "column_" + (index + 1);
  const base = key;
  let n = 2;
  while (used.has(key)) key = `${base}_${n++}`;
  used.add(key);
  return key;
}

function cleanColumns(columns, warnings) {
  if (!Array.isArray(columns)) return undefined;
  const used = new Set();
  const roles = new Set();
  const out = [];
  columns.forEach((raw, index) => {
    // A column needs at least a key or a heading to mean anything.
    if (!isPlainObject(raw) || (typeof raw.key !== "string" && typeof raw.label !== "string")) {
      warnings.push("An invalid column was skipped.");
      return;
    }
    const width = Number(raw.width);
    let role = COLUMN_ROLES.includes(raw.role) ? raw.role : "none";
    if (role !== "none") {
      if (roles.has(role)) role = "none";
      else roles.add(role);
    }
    out.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
      key: cleanKey(raw.key, index, used),
      label: cleanText(raw.label) || "Column",
      type: COLUMN_TYPES.includes(raw.type) ? raw.type : "text",
      width: Number.isFinite(width) ? Math.min(WIDTH.max, Math.max(WIDTH.min, width)) : WIDTH.fallback,
      align: COLUMN_ALIGNS.includes(raw.align) ? raw.align : "left",
      visible: raw.visible !== false,
      role
    });
  });
  // An empty list falls back to the default columns in setColumns().
  return out;
}

function cleanCell(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return String(value);
  return "";
}

function cleanItems(items, columns, warnings) {
  if (items === undefined) return undefined;
  if (!Array.isArray(items)) {
    warnings.push("Line items were not a list and were not imported.");
    return [];
  }
  const numericKeys = (columns || [])
    .filter(c => NUMERIC_COLUMN_TYPES.includes(c.type))
    .map(c => c.key);

  // Text amounts in this invoice are read with one separator, judged from the
  // invoice's own unambiguous values.
  const decimal = detectDecimalSeparator(items.flatMap(raw =>
    (isPlainObject(raw) ? numericKeys.map(key => raw[key]) : [])));

  const out = [];
  let repaired = 0;
  for (const raw of items) {
    if (!isPlainObject(raw)) continue;
    const item = {};
    for (const [key, value] of Object.entries(raw)) {
      if (UNSAFE_KEYS.includes(key)) continue;
      if (key === FIXED_AMOUNT_KEY) {
        if (typeof value === "number" && Number.isFinite(value)) item[key] = value;
        continue;
      }
      item[key] = cleanCell(value);
    }
    for (const key of numericKeys) {
      if (typeof item[key] === "string" && item[key].trim() !== "") {
        const parsed = parseAmount(item[key], decimal);
        if (parsed !== null) {
          item[key] = parsed;
          repaired++;
        }
      }
    }
    out.push(item);
  }
  if (out.length !== items.length) warnings.push("Some invalid line items were skipped.");
  // Older versions could store amounts such as "1,234.50" as text, which then
  // counted as 0. They are now read as numbers, so totals can change: say so.
  if (repaired) {
    warnings.push(`${repaired} amount${repaired === 1 ? " was" : "s were"} stored as text and ${repaired === 1 ? "has" : "have"} been read as ${repaired === 1 ? "a number" : "numbers"}; please check the totals.`);
  }
  return out;
}

function cleanSections(sections) {
  if (!isPlainObject(sections)) return undefined;
  const known = SECTION_DEFS.map(([key]) => key);
  const out = {};
  for (const key of known) {
    if (typeof sections[key] === "boolean") out[key] = sections[key];
  }
  return out;
}

/**
 * @param {unknown} data
 * @returns {{snapshot: object, warnings: string[]}}
 * @throws when the payload is not an invoice object at all
 */
export function normalizeSnapshot(data) {
  // Something with none of the invoice parts (another app's JSON, say) is
  // rejected rather than "imported" as a blank invoice over the current one.
  if (!isPlainObject(data) ||
      !(isPlainObject(data.fields) || Array.isArray(data.columns) || Array.isArray(data.items))) {
    throw Error("This file is not an SA Invoice Generator invoice. Nothing was changed.");
  }
  const warnings = [];

  const fields = {};
  if (isPlainObject(data.fields)) {
    for (const id of FIELD_IDS) {
      // null/undefined mean "no value given": the current value is kept rather
      // than blanked.
      if (id in data.fields && data.fields[id] !== null && data.fields[id] !== undefined) {
        fields[id] = cleanText(data.fields[id]);
      }
    }
  }

  let logo = "";
  if (isSafeLogo(data.logo)) logo = data.logo;
  else if (data.logo) warnings.push("The logo was not an embedded image and was removed.");
  // Same rule for the watermark image.
  let watermark = "";
  if (isSafeLogo(data.watermark)) watermark = data.watermark;
  else if (data.watermark) warnings.push("The watermark image was not an embedded image and was removed.");

  const zoom = Number(data.zoom);
  const columns = cleanColumns(data.columns, warnings);
  // Items are interpreted against the incoming columns when present, otherwise
  // against no columns (numeric repair is then skipped, values kept as given).
  const items = cleanItems(data.items, columns, warnings);

  const snapshot = {
    ...(data.version !== undefined ? { version: data.version } : {}),
    logo,
    watermark,
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
    columns,
    items,
    sections: cleanSections(data.sections),
    fields
  };
  return { snapshot, warnings };
}
