/** Show / hide invoice section toggles. */

import { $ } from "../utils.js";
import { SECTION_DEFS } from "../constants.js";
import { state, setSection } from "../state.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice } from "../storage/invoice-storage.js";

export function renderToggles() {
  const root = $("sectionToggles");
  root.innerHTML = SECTION_DEFS
    .map(([key, label]) => `<div class="toggleline"><span>${label}</span><label class="switch"><input type="checkbox" data-section-toggle="${key}" ${state.sections[key] ? "checked" : ""}><span class="slider"></span></label></div>`)
    .join("");
  root.querySelectorAll("[data-section-toggle]").forEach(el => {
    el.onchange = () => {
      setSection(el.dataset.sectionToggle, el.checked);
      renderPreview();
      saveInvoice();
    };
  });
}
