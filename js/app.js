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

import { $, today, plusDays, toast, toastError } from "./utils.js";
import { DEFAULT_DUE_DAYS, APP_VERSION } from "./constants.js";
import * as TemplateRegistry from "./templates/template-registry.js";
import modernTemplate from "./templates/modern.js";
import minimalTemplate from "./templates/minimal.js";
import classicTemplate from "./templates/classic.js";
import royaltyTemplate from "./templates/royalty.js";
import ukhfTemplate from "./templates/ukhf.js";
import multipurposeTemplate from "./templates/multipurpose.js";

import { initTabs } from "./editor/tabs.js";
import { initFieldBindings } from "./editor/details.js";
import { initItemControls } from "./editor/items.js";
import { initColumnControls } from "./editor/columns.js";
import { setAccent, initLogoControls, initZoomControls, applyLogoDefaults, fitPreviewOnNarrowScreens } from "./editor/design.js";
import { initJumpButton } from "./editor/jump.js";
import { initPanels } from "./editor/panels.js";
import { initWatermarkControls } from "./editor/watermark-controls.js";
import { initSidebarResizer } from "./editor/sidebar.js";
import { initToolbar } from "./editor/toolbar.js";
import { initLibraryControls, refreshLibraries } from "./editor/library.js";
import { initBundleTools } from "./editor/bundles.js";
import { initHistoryControls } from "./editor/history-controls.js";
import { configureHistory } from "./history/invoice-history.js";

import { renderAll, applySnapshot } from "./session.js";
import { serialize } from "./invoice/invoice-data.js";
import { state } from "./state.js";
import { restoreAtStartup, captureBlankDefaults } from "./documents.js";
import { initInvoiceList } from "./editor/invoices.js";
import { initClientBook } from "./editor/clients.js";
import { initSaveState } from "./editor/save-state.js";
import { initMoreMenu } from "./editor/menu.js";
import { DEFAULT_ACCENT } from "./constants.js";
import { installCompatibilityGlobals } from "./compat.js";
import { initTabSync } from "./storage/tab-sync.js";

/** Runs a startup step, reporting rather than aborting on failure. */
function step(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[SA Invoice Generator] startup step "${name}" failed:`, err);
  }
}

function registerTemplates() {
  // Modern is registered first, so it is also the fallback for unknown ids.
  [modernTemplate, minimalTemplate, classicTemplate, royaltyTemplate, ukhfTemplate, multipurposeTemplate]
    .forEach(TemplateRegistry.register);
}

function seedDefaults() {
  applyLogoDefaults();
  $("invoiceDate").value = today();
  $("dueDate").value = plusDays(today(), DEFAULT_DUE_DAYS);
  setAccent(DEFAULT_ACCENT);
}

/** Opens the right invoice at start-up; see documents.restoreAtStartup(). */
function restoreAutosave() {
  const messages = restoreAtStartup();
  if (messages.length) toastError(messages.join(" "));
}

/**
 * After an update, a browser can keep some old script files from its cache and
 * mix them with new ones. index.html and the scripts each carry the release
 * number; if they differ, the user is told to reload fully.
 */
function checkVersion() {
  const pageVersion = document.querySelector('meta[name="sa-app-version"]')?.content;
  if (pageVersion && pageVersion !== APP_VERSION) {
    toast("Some app files are from an older version. Reload with Ctrl+Shift+R (Cmd+Shift+R on a Mac).");
  }
}

export function init() {
  // The scripts are running, so the "could not start" banner does not apply.
  document.getElementById("bootError")?.remove();
  step("templates", registerTemplates);

  step("tabs", initTabs);
  step("fields", initFieldBindings);
  step("items", initItemControls);
  step("columns", initColumnControls);
  step("logo", initLogoControls);
  step("zoom", initZoomControls);
  step("sidebar", initSidebarResizer);
  step("toolbar", initToolbar);
  step("more menu", initMoreMenu);
  step("library controls", initLibraryControls);
  // Guarded like every other step: a failure in the bundle tool must not stop
  // the invoice editor loading.
  step("bundle tools", initBundleTools);

  step("defaults", seedDefaults);
  step("first render", renderAll);
  // Remembered before any saved data is applied: "New blank invoice" uses it.
  step("blank defaults", captureBlankDefaults);
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
  step("saved invoices", initInvoiceList);
  step("client book", initClientBook);
  // After the invoice is restored, so "Your company" can start closed when filled.
  step("watermark", initWatermarkControls);
  step("panels", initPanels);
  step("save indicator", initSaveState);
  step("jump button", initJumpButton);
  step("fit preview", fitPreviewOnNarrowScreens);
  // After the autosave is restored, so the starting point is this tab's view.
  step("tab sync", initTabSync);
  step("version check", checkVersion);
  step("compatibility globals", installCompatibilityGlobals);
}

init();
