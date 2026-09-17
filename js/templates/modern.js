/**
 * Modern Professional. This is the base invoice design, so its styling lives in
 * css/invoice.css rather than a template-specific stylesheet, and it overrides
 * nothing: user column headings and generic labels are used as-is.
 */

import { dateFmt } from "../invoice/formatters.js";
import { metaCompany } from "../invoice/invoice-data.js";

export default {
  id: "modern",
  name: "Modern Professional",
  cssClass: "template-modern",
  fontStack: "Inter / Segoe UI / Arial",
  labels: {
    title: "INVOICE", bill: "Bill to", status: "Invoice status", balance: "Balance due",
    note: "Invoice note", payment: "Payment details", terms: "Terms",
    date: "Invoice date", due: "Due date", ref: "Reference"
  },
  capabilities: {
    invoiceNoPrefix: "#",
    formatDate: dateFmt,
    companyMeta: metaCompany,
    structuredPayment: false,
    repairNoteTypo: false,
    hideReferenceRowWhenEmpty: false,
    paymentIgnoresSectionToggle: false,
    dropRateWhenAmount: false,
    dropSkuWhenDescription: false,
    fixedColumnWidths: null,
    headerLabels: null,
    showTableTotalRow: false,
    separatePaymentPage: false
  }
};
