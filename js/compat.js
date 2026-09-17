/**
 * Backward-compatibility surface.
 *
 * The original application exposed a number of functions on `window`. Modules
 * no longer need them, but anything outside the app that referenced them (a
 * bookmarklet, an automation script, a saved console snippet) would break
 * silently, so the names are re-exported here and nowhere else.
 *
 * `window.InvoiceStudio` additionally provides a small, documented seam used by
 * the regression harness. Nothing inside the application reads from it.
 */

import { loadTemplate, deleteTemplate, loadBrand, deleteBrand, refreshLibraries } from "./editor/library.js";
import { buildInvoicePrintDocument } from "./print/print.js";
import { applySnapshot } from "./session.js";
import { serialize, serializeBrand } from "./invoice/invoice-data.js";
import { renderPreview } from "./invoice/invoice-renderer.js";
import { getTotals } from "./invoice/calculations.js";
import { state } from "./state.js";
import * as TemplateRegistry from "./templates/template-registry.js";

export function installCompatibilityGlobals() {
  // Legacy global handlers, preserved by name.
  window.loadInvoiceTemplate = loadTemplate;
  window.deleteInvoiceTemplate = deleteTemplate;
  window.loadInvoiceBrand = loadBrand;
  window.deleteInvoiceBrand = deleteBrand;
  window.buildInvoicePrintDocument = buildInvoicePrintDocument;

  // Namespaced seam for tooling and tests.
  window.InvoiceStudio = {
    state,
    serialize,
    serializeBrand,
    applySnapshot,
    renderPreview,
    getTotals,
    refreshLibraries,
    templates: TemplateRegistry
  };
}
