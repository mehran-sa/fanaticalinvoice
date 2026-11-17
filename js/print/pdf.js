/**
 * Print and PDF export. The browser's own print-to-PDF is used deliberately: it
 * is what produces the A4 output the reference invoices were matched against,
 * and it avoids bundling a PDF engine.
 *
 * Both open Check and export first (js/editor/export-dialog.js): what to fix,
 * the PDF's file name, and whether to mark the invoice as issued.
 */

import { toast, fieldValue } from "../utils.js";
import { buildInvoicePrintDocument } from "./print.js";
import { paperFor } from "../constants.js";
import * as TemplateRegistry from "../templates/template-registry.js";
import { openExportDialog } from "../editor/export-dialog.js";

/**
 * With "Save as PDF" the paper size is set automatically. A printer driver
 * (including "Microsoft Print to PDF") uses its own paper and shrinks the page
 * to fit when it differs, so the paper to choose is spelled out.
 */
export const paperAdvice = () => {
  const paper = paperFor(TemplateRegistry.get(fieldValue("template")));
  return `Paper: ${paper.label}, scale 100% (Save as PDF sets this automatically).`;
};

/** Prints or saves now, without the check (the dialog has been through it). */
export function printNow(action, fileName) {
  toast(action === "print" ? paperAdvice() : `Choose “Save as PDF” in the print dialog. It is named ${fileName}.pdf. ` + paperAdvice());
  return buildInvoicePrintDocument(true, { title: fileName });
}

export function printInvoice() {
  return openExportDialog("print");
}

export function exportInvoicePDF() {
  return openExportDialog("export");
}
