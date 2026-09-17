/**
 * Draggable sidebar width.
 *
 * Note: the width is written to the --sidebar-width custom property and to
 * localStorage, but no stylesheet currently consumes that property, so the
 * handle has no visible effect. This behaviour is carried over unchanged from
 * the original application; see README "Known issues".
 */

import { $, clamp } from "../utils.js";
import { LIMITS, STORAGE_KEYS, SIDEBAR_RESIZE_MIN_VIEWPORT } from "../constants.js";
import { readRaw, writeRaw } from "../storage/local-storage.js";

const applyWidth = width => {
  document.documentElement.style.setProperty("--sidebar-width", width + "px");
};

const persistWidth = width => {
  applyWidth(width);
  writeRaw(STORAGE_KEYS.sidebarWidth, String(width));
};

export function initSidebarResizer() {
  const resizer = $("sidebarResizer");
  if (!resizer) return;

  const saved = Number(readRaw(STORAGE_KEYS.sidebarWidth));
  if (saved >= LIMITS.sidebar.min && saved <= LIMITS.sidebar.max) applyWidth(saved);

  let resizing = false;

  resizer.addEventListener("mousedown", e => {
    if (window.innerWidth <= SIDEBAR_RESIZE_MIN_VIEWPORT) return;
    resizing = true;
    document.body.classList.add("resizing-sidebar");
    resizer.classList.add("dragging");
    e.preventDefault();
  });
  window.addEventListener("mousemove", e => {
    if (!resizing) return;
    persistWidth(clamp(e.clientX, LIMITS.sidebar.min, LIMITS.sidebar.max));
  });
  window.addEventListener("mouseup", () => {
    if (!resizing) return;
    resizing = false;
    document.body.classList.remove("resizing-sidebar");
    resizer.classList.remove("dragging");
  });
  resizer.addEventListener("dblclick", () => persistWidth(LIMITS.sidebar.fallback));
}
