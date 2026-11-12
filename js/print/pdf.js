/**
 * Print and PDF export. The browser's own print-to-PDF is used deliberately: it
 * is what produces the A4 output the reference invoices were matched against,
 * and it avoids bundling a PDF engine.
 *
 * Both first run the export check (export-check.js). When it finds problems,
 * the user can go back to the first one or continue anyway.
 */

import { toast } from "../utils.js";
import { buildInvoicePrintDocument } from "./print.js";
import { findExportIssues, goToIssue } from "./export-check.js";
import { confirmAction } from "../ui/confirm-dialog.js";
import { paperFor } from "../constants.js";
import { fieldValue } from "../utils.js";
import * as TemplateRegistry from "../templates/template-registry.js";

/**
 * With "Save as PDF" the paper size is set automatically. A printer driver
 * (including "Microsoft Print to PDF") uses its own paper and shrinks the page
 * to fit when it differs, so the paper to choose is spelled out.
 */
const paperAdvice = () => {
  const paper = paperFor(TemplateRegistry.get(fieldValue("template")));
  return `Paper: ${paper.label}, scale 100% (Save as PDF sets this automatically).`;
};

/** @returns {Promise<boolean>} true when printing should go ahead */
async function readyToPrint(action) {
  const issues = findExportIssues();
  if (!issues.length) return true;
  const go = await confirmAction({
    title: "Check before you " + action,
    message: issues.length === 1 ? "This invoice may not be ready:" : `This invoice may not be ready (${issues.length} things to check):`,
    list: issues.map(i => i.text),
    confirmLabel: action === "print" ? "Print anyway" : "Export anyway",
    cancelLabel: "Go back and fix"
  });
  if (!go) goToIssue(issues[0]);
  return go;
}

export async function printInvoice() {
  if (!(await readyToPrint("print"))) return null;
  toast(paperAdvice());
  return buildInvoicePrintDocument(true);
}

export async function exportInvoicePDF() {
  if (!(await readyToPrint("export"))) return null;
  toast("Choose \u201cSave as PDF\u201d in the print dialog. " + paperAdvice());
  return buildInvoicePrintDocument(true);
}
