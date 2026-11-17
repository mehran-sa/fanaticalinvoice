/**
 * Central application state and the controlled accessors used to change it.
 *
 * The shape is unchanged from the original application so that previously
 * saved invoices, templates and brands keep loading without migration.
 *
 * @typedef {"text"|"number"|"currency"|"percentage"|"date"} ColumnType
 * @typedef {"none"|"quantity"|"rate"|"amount"} ColumnRole
 * @typedef {"left"|"right"|"center"} ColumnAlign
 *
 * @typedef {Object} Column
 * @property {string} id
 * @property {string} key      Property name used on each line item.
 * @property {string} label    Heading shown in the editor and, on the Modern
 *                             template, on the invoice itself.
 * @property {ColumnType} type
 * @property {number} width    Percentage width, used when no template-specific
 *                             widths apply.
 * @property {ColumnAlign} align
 * @property {boolean} visible
 * @property {ColumnRole} role At most one column per calculation role.
 *
 * @typedef {Record<string, string|number>} LineItem
 *
 * @typedef {Object} AppState
 * @property {string} logo     Data URL, or "" when no logo is set.
 * @property {string} watermark Uploaded watermark image (data URL), or "".
 * @property {number} zoom
 * @property {Column[]} columns
 * @property {LineItem[]} items
 * @property {Record<string, boolean>} sections
 * @property {string} invoiceId  Id of this invoice in the saved-invoices
 *                               library (js/storage/invoice-library.js).
 */

import { SECTION_DEFS, LIMITS } from "./constants.js";
import { clamp } from "./utils.js";

/** @returns {Column[]} */
export const defaultColumns = () => [
  { id: crypto.randomUUID(), key: "sku", label: "SKU", type: "text", width: 14, align: "left", visible: true, role: "none" },
  { id: crypto.randomUUID(), key: "description", label: "Description", type: "text", width: 44, align: "left", visible: true, role: "none" },
  { id: crypto.randomUUID(), key: "quantity", label: "Qty", type: "number", width: 11, align: "right", visible: true, role: "quantity" },
  { id: crypto.randomUUID(), key: "rate", label: "Rate", type: "currency", width: 14, align: "right", visible: true, role: "rate" },
  { id: crypto.randomUUID(), key: "amount", label: "Amount", type: "currency", width: 17, align: "right", visible: true, role: "amount" }
];

/** All sections visible: the default, and the base for merging loaded data. */
export const defaultSections = () => Object.fromEntries(SECTION_DEFS.map(([key]) => [key, true]));

/** @type {AppState} */
export const state = {
  logo: "",
  watermark: "",
  zoom: 1,
  columns: defaultColumns(),
  items: [],
  sections: defaultSections(),
  invoiceId: ""
};

export const setInvoiceId = id => { state.invoiceId = typeof id === "string" ? id : ""; };

/* ----------------------------------------------------------- selectors */

/** First column assigned to a calculation role, if any. */
export const roleCol = role => state.columns.find(c => c.role === role);

/** Columns the user can edit directly (amount columns are derived). */
export const editableColumns = () => state.columns.filter(c => c.role !== "amount");

/* ----------------------------------------------------------- mutators */

export const setLogo = dataUrl => { state.logo = dataUrl || ""; };
export const setWatermark = dataUrl => { state.watermark = dataUrl || ""; };

export const setZoom = zoom => {
  state.zoom = clamp(zoom, LIMITS.zoom.min, LIMITS.zoom.max);
  return state.zoom;
};

export const setItems = items => { state.items = Array.isArray(items) ? items : []; };
export const addItem = item => { state.items.push(item); };
export const removeItemAt = index => { state.items.splice(index, 1); };
export const clearItems = () => { state.items = []; };

export const setColumns = columns => {
  state.columns = Array.isArray(columns) && columns.length ? columns : defaultColumns();
};
export const addColumn = column => { state.columns.push(column); };
export const removeColumnAt = index => { state.columns.splice(index, 1); };

export const moveColumn = (from, to) => {
  const [moved] = state.columns.splice(from, 1);
  state.columns.splice(to, 0, moved);
};

/** A calculation role is exclusive: assigning it clears it elsewhere. */
export const assignColumnRole = (column, role) => {
  if (role !== "none") {
    state.columns.forEach(other => { if (other !== column && other.role === role) other.role = "none"; });
  }
  column.role = role;
};

export const setSections = sections => {
  state.sections = { ...defaultSections(), ...(sections || {}) };
};
export const setSection = (key, visible) => { state.sections[key] = visible; };

/** Builds a blank line item using the current columns. */
export const createBlankItem = () => {
  const item = {};
  state.columns.forEach(c => { item[c.key] = c.role === "quantity" ? 1 : ""; });
  return item;
};
