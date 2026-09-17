/**
 * PDF export. The browser's own print-to-PDF is used deliberately: it is what
 * produces the A4 output the reference invoices were matched against, and it
 * avoids bundling a PDF engine.
 */

import { toast } from "../utils.js";
import { buildInvoicePrintDocument } from "./print.js";

export function printInvoice() {
  return buildInvoicePrintDocument(true);
}

export function exportInvoicePDF() {
  toast("Choose \u201cSave as PDF\u201d in the print dialog.");
  return buildInvoicePrintDocument(true);
}
