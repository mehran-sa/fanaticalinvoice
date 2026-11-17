/**
 * Narrow screens (phones and small tablets): the editor and the preview take
 * turns, chosen with the Edit / Preview switch under the top bar, and the
 * total with Check and export stays at the bottom of the screen.
 */

import { $ } from "../utils.js";
import { SIDEBAR_RESIZE_MIN_VIEWPORT } from "../constants.js";

const narrow = () => window.innerWidth <= SIDEBAR_RESIZE_MIN_VIEWPORT;

/** Shows the editor or the preview (narrow screens only; wide screens show both). */
export function showSide(side, { focus = false } = {}) {
  const preview = side === "preview";
  document.body.dataset.mobileView = preview ? "preview" : "edit";
  const edit = $("showEdit");
  const show = $("showPreview");
  edit.setAttribute("aria-selected", String(!preview));
  show.setAttribute("aria-selected", String(preview));
  edit.tabIndex = preview ? -1 : 0;
  show.tabIndex = preview ? 0 : -1;
  if (preview && narrow()) $("zoomFit")?.click();
  if (focus) (preview ? show : edit).focus();
  if (narrow()) window.scrollTo(0, 0);
}

export function initMobile() {
  const edit = $("showEdit");
  const show = $("showPreview");
  if (!edit || !show) return;
  edit.onclick = () => showSide("edit");
  show.onclick = () => showSide("preview");
  for (const tab of [edit, show]) {
    tab.addEventListener("keydown", e => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      showSide(tab === edit ? "preview" : "edit", { focus: true });
    });
  }
  // Going to a field (from Check and export, or the preview) shows the editor.
  document.addEventListener("sa:show-editor", () => showSide("edit"));
  document.body.dataset.mobileView = "edit";
}
