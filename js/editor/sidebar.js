/**
 * Draggable sidebar width.
 *
 * The width is written to the --sidebar-width custom property, which the app
 * grid in css/layout.css reads, and to localStorage. Previously no stylesheet
 * consumed the property and the handle had no size, so it could not be used.
 *
 * Mouse: drag the handle; double-click restores the default width.
 * Keyboard: focus the handle, then Left/Right arrows resize and Home restores
 * the default. The handle is hidden on narrow screens, where the layout stacks.
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

  const KEY_STEP = 20;
  resizer.addEventListener("keydown", e => {
    const current = Number(readRaw(STORAGE_KEYS.sidebarWidth)) || LIMITS.sidebar.fallback;
    let next = null;
    if (e.key === "ArrowLeft") next = current - KEY_STEP;
    else if (e.key === "ArrowRight") next = current + KEY_STEP;
    else if (e.key === "Home") next = LIMITS.sidebar.fallback;
    if (next === null) return;
    e.preventDefault();
    persistWidth(clamp(next, LIMITS.sidebar.min, LIMITS.sidebar.max));
  });
}
