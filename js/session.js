/**
 * Session coordinator: applies a whole snapshot to state + form + UI.
 *
 * This is the one place that knows every surface needing a refresh, which keeps
 * the editor modules from having to know about each other. Dependency direction
 * is one-way: session imports editor/render/storage, never the reverse.
 */

import { fieldValue, setFieldValue } from "./utils.js";
import { FIELD_IDS } from "./constants.js";
import { setLogo, setWatermark, setZoom, setColumns, setItems, setSections } from "./state.js";
import { setAccent } from "./editor/design.js";
import { renderColumns } from "./editor/columns.js";
import { renderItems } from "./editor/items.js";
import { renderToggles } from "./editor/sections.js";
import { updateDateWarning } from "./editor/details.js";
import { normalizeSnapshot, isSafeLogo } from "./invoice/snapshot.js";
import { renderPreview } from "./invoice/invoice-renderer.js";
import { saveInvoice } from "./storage/invoice-storage.js";

/**
 * The accent colour to apply after loading data: the HEX field when it holds a
 * complete colour, otherwise the colour picker (a HEX value can be saved half
 * typed, and would otherwise reset the accent to the default).
 */
const currentAccent = () => {
  const hex = fieldValue("accentHex").trim();
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex : fieldValue("accent");
};

/** Re-renders every editor panel and the preview. */
export function renderAll() {
  renderColumns();
  renderItems();
  renderToggles();
  renderPreview();
  updateDateWarning();
}

/**
 * Restores a snapshot produced by serialize().
 *
 * The payload is validated and repaired first (see invoice/snapshot.js), so a
 * damaged or hostile file is rejected before anything in the current invoice
 * changes, and cannot inject markup or a remote logo address.
 *
 * @param {object} raw
 * @param {{persist?: boolean}} [options] persist: false applies the snapshot
 *        without writing it back to storage. Used when restoring the autosave
 *        at start-up: re-saving what was just read could put back an older
 *        invoice over a newer save made meanwhile in another tab.
 * @returns {string[]} warnings about data that was repaired or dropped
 * @throws when the payload is not an invoice object
 */
export function applySnapshot(raw, { persist = true } = {}) {
  const { snapshot: data, warnings } = normalizeSnapshot(raw);

  FIELD_IDS.forEach(id => {
    if (id in data.fields) setFieldValue(id, data.fields[id]);
  });

  setLogo(data.logo);
  setWatermark(data.watermark);
  setZoom(data.zoom || 1);
  setColumns(data.columns);
  setItems(data.items);
  setSections(data.sections);

  setAccent(currentAccent());
  renderAll();
  if (persist) saveInvoice();
  return warnings;
}

/**
 * Applies a brand record. Brands intentionally do not touch line items,
 * columns or section toggles, so only the preview is re-rendered.
 * @param {() => (string|undefined)} apply returns a logo data URL when present
 */
export function applyBrand(apply) {
  const result = apply();
  // Older callers return the logo string; brands now return {logo, watermark}.
  const { logo, watermark } = typeof result === "string" ? { logo: result } : (result || {});
  // Same rule as invoice snapshots: an embedded image or nothing, never a
  // remote address that would make the browser contact another server.
  const safe = v => (v === "" || isSafeLogo(v) ? v : "");
  if (typeof logo === "string") setLogo(safe(logo));
  if (typeof watermark === "string") setWatermark(safe(watermark));
  setAccent(currentAccent());
  renderPreview();
  saveInvoice();
}
