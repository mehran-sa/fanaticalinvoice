/**
 * Multipurpose. A general-purpose A4 invoice for any brand or client.
 * Styling: css/templates/multipurpose.css
 *
 *  - accent band across the top, "INVOICE" in the accent colour
 *  - logo and company details left; number, dates and amount due right
 *  - "Bill to" in its own panel
 *  - items table with an accent header row and light row stripes
 *  - notes and payment details beside the totals; the total in an accent bar
 *  - terms, then a footer with the company's registration and contact details
 *  - watermarks, a 12mm bottom margin on every page, rows and totals never
 *    split across pages
 * Every column, section and calculation works as in the editor.
 */

import { dateFmt } from "../invoice/formatters.js";
import { metaCompany } from "../invoice/invoice-data.js";
import { trimmedField, fieldOr } from "../utils.js";

/** Footer: company name, registration, VAT and contact on one line. */
const footerLine = () => [
  fieldOr("companyName", "Your Company"),
  trimmedField("companyReg") && "Reg. no. " + trimmedField("companyReg"),
  trimmedField("companyVat") && "VAT " + trimmedField("companyVat"),
  trimmedField("companyEmail"),
  trimmedField("companyPhone"),
  trimmedField("companyWebsite")
].filter(Boolean).join("   |   ");

export default {
  id: "multipurpose",
  name: "Multipurpose",
  description: "General-purpose invoice for any brand or client: accent header band, clear totals, payment details and terms.",
  cssClass: "template-multipurpose",
  fontStack: "Inter / Segoe UI / Arial",
  labels: {
    title: "INVOICE", bill: "Bill to", balance: "Amount due",
    note: "Notes", payment: "Payment details", terms: "Terms & conditions",
    date: "Issue date", due: "Due date", ref: "Reference"
  },
  capabilities: {
    invoiceNoPrefix: "No. ",
    formatDate: dateFmt,
    companyMeta: metaCompany,
    structuredPayment: false,
    repairNoteTypo: false,
    hideReferenceRowWhenEmpty: true,
    paymentIgnoresSectionToggle: false,
    dropRateWhenAmount: false,
    dropSkuWhenDescription: false,
    fixedColumnWidths: null,
    headerLabels: null,
    showTableTotalRow: false,
    separatePaymentPage: false,
    footerText: footerLine,
    watermark: true,
    printMargins: { bottom: 12 }
  }
};
