/**
 * Session coordinator: applies a whole snapshot to state + form + UI.
 *
 * This is the one place that knows every surface needing a refresh, which keeps
 * the editor modules from having to know about each other. Dependency direction
 * is one-way: session imports editor/render/storage, never the reverse.
 */

import { $, fieldValue } from "./utils.js";
import { FIELD_IDS } from "./constants.js";
import { setLogo, setZoom, setColumns, setItems, setSections } from "./state.js";
import { setAccent } from "./editor/design.js";
import { renderColumns } from "./editor/columns.js";
import { renderItems } from "./editor/items.js";
import { renderToggles } from "./editor/sections.js";
import { renderPreview } from "./invoice/invoice-renderer.js";
import { saveInvoice } from "./storage/invoice-storage.js";

/** Re-renders every editor panel and the preview. */
export function renderAll() {
  renderColumns();
  renderItems();
  renderToggles();
  renderPreview();
}

/**
 * Restores a snapshot produced by serialize().
 * @param {object} data
 * @throws when the payload is not an object
 */
export function applySnapshot(data) {
  if (!data || typeof data !== "object") throw Error("Invalid invoice file.");

  FIELD_IDS.forEach(id => {
    if (data.fields && id in data.fields) $(id).value = data.fields[id];
  });

  setLogo(data.logo);
  setZoom(data.zoom || 1);
  setColumns(data.columns);
  setItems(data.items);
  setSections(data.sections);

  setAccent(fieldValue("accentHex"));
  renderAll();
  saveInvoice();
}

/**
 * Applies a brand record. Brands intentionally do not touch line items,
 * columns or section toggles, so only the preview is re-rendered.
 * @param {() => (string|undefined)} apply returns a logo data URL when present
 */
export function applyBrand(apply) {
  const logo = apply();
  if (typeof logo === "string") setLogo(logo);
  setAccent(fieldValue("accentHex"));
  renderPreview();
  saveInvoice();
}
