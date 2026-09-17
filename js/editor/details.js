/**
 * Binds every persisted form control to the render + autosave cycle.
 *
 * This is the generic path: user input -> (accent side effect) -> render -> save.
 * Controls needing extra behaviour (logo upload, zoom, columns, items) have
 * their own modules.
 */

import { $, fieldValue } from "../utils.js";
import { FIELD_IDS } from "../constants.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice } from "../storage/invoice-storage.js";
import { setAccent } from "./design.js";

export function initFieldBindings() {
  FIELD_IDS.forEach(id => {
    const el = $(id);
    if (!el) return;
    const eventName = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(eventName, () => {
      if (id === "accent" || id === "accentHex") setAccent(fieldValue(id));
      renderPreview();
      // Keystrokes: coalesced into a single history entry.
      saveInvoice({ typing: true });
    });
  });
}
