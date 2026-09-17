/**
 * Application entry point.
 *
 * Startup sequence:
 *   register templates -> wire editor controls -> seed defaults
 *   -> first render -> restore autosave -> render saved libraries
 *
 * Each step is guarded so that a failure in one optional feature (for example
 * the saved-library panel) cannot stop the rest of the application loading.
 */

import { $, today, plusDays, toast } from "./utils.js";
import { DEFAULT_DUE_DAYS } from "./constants.js";
import * as TemplateRegistry from "./templates/template-registry.js";
import modernTemplate from "./templates/modern.js";
import minimalTemplate from "./templates/minimal.js";
import classicTemplate from "./templates/classic.js";
import royaltyTemplate from "./templates/royalty.js";

import { initTabs } from "./editor/tabs.js";
import { initFieldBindings } from "./editor/details.js";
import { initItemControls } from "./editor/items.js";
import { initColumnControls } from "./editor/columns.js";
import { setAccent, initLogoControls, initZoomControls, applyLogoDefaults } from "./editor/design.js";
import { initSidebarResizer } from "./editor/sidebar.js";
import { initToolbar } from "./editor/toolbar.js";
import { initLibraryControls, refreshLibraries } from "./editor/library.js";
import { initBundleTools } from "./editor/bundles.js";
import { initHistoryControls } from "./editor/history-controls.js";
import { configureHistory } from "./history/invoice-history.js";

import { renderAll, applySnapshot } from "./session.js";
import { serialize } from "./invoice/invoice-data.js";
import { state } from "./state.js";
import { loadInvoice } from "./storage/invoice-storage.js";
import { DEFAULT_ACCENT } from "./constants.js";
import { installCompatibilityGlobals } from "./compat.js";

/** Runs a startup step, reporting rather than aborting on failure. */
function step(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[InvoiceStudio] startup step "${name}" failed:`, err);
  }
}

function registerTemplates() {
  // Modern is registered first, so it is also the fallback for unknown ids.
  [modernTemplate, minimalTemplate, classicTemplate, royaltyTemplate]
    .forEach(TemplateRegistry.register);
}

function seedDefaults() {
  applyLogoDefaults();
  $("invoiceDate").value = today();
  $("dueDate").value = plusDays(today(), DEFAULT_DUE_DAYS);
  setAccent(DEFAULT_ACCENT);
}

function restoreAutosave() {
  const saved = loadInvoice();
  if (!saved) return;
  try {
    applySnapshot(saved);
  } catch (err) {
    console.error("[InvoiceStudio] the autosaved invoice could not be restored:", err);
    toast("The saved invoice could not be restored.");
  }
}

export function init() {
  step("templates", registerTemplates);

  step("tabs", initTabs);
  step("fields", initFieldBindings);
  step("items", initItemControls);
  step("columns", initColumnControls);
  step("logo", initLogoControls);
  step("zoom", initZoomControls);
  step("sidebar", initSidebarResizer);
  step("toolbar", initToolbar);
  step("library controls", initLibraryControls);
  // Guarded like every other step: a failure in the bundle tool must not stop
  // the invoice editor loading.
  step("bundle tools", initBundleTools);

  step("defaults", seedDefaults);
  step("first render", renderAll);
  step("restore autosave", restoreAutosave);
  // History is seeded after the autosave is restored, so the starting point is
  // the invoice the user actually sees. Zoom is carried over from live state on
  // restore, keeping the preview zoom out of undo.
  step("history", () => configureHistory({
    capture: serialize,
    restore: snapshot => applySnapshot({ ...snapshot, zoom: state.zoom })
  }));
  step("history controls", initHistoryControls);

  step("libraries", refreshLibraries);
  step("compatibility globals", installCompatibilityGlobals);
}

init();
