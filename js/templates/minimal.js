/**
 * Janets PDF - Exact Layout. Matched to the supplied Invoice JF2026-04 PDF.
 * Styling: css/templates/minimal.css (which also embeds the Nimbus Sans faces).
 *
 * Template-specific behaviour:
 *  - a space after the "#" in the invoice number
 *  - SKU is dropped when a Description column is present (single "Item" column)
 *  - payment details are shown whenever text exists, even if the Payment
 *    section toggle is off
 *  - payment details always start on a new printed page
 */

import { dateFmt } from "../invoice/formatters.js";
import { metaCompany } from "../invoice/invoice-data.js";

export default {
  id: "minimal",
  name: "Janets PDF - Exact Layout",
  cssClass: "template-minimal",
  fontStack: "Nimbus Sans Regular + Bold",
  labels: {
    title: "INVOICE", bill: "Bill To:", status: "Status:", balance: ":",
    note: "Notes:", payment: "Notes:", terms: "Terms:",
    date: "Date:", due: "Due date:", ref: ":"
  },
  capabilities: {
    invoiceNoPrefix: "# ",
    formatDate: dateFmt,
    companyMeta: metaCompany,
    structuredPayment: false,
    repairNoteTypo: false,
    hideReferenceRowWhenEmpty: false,
    paymentIgnoresSectionToggle: true,
    dropRateWhenAmount: false,
    dropSkuWhenDescription: true,
    fixedColumnWidths: ["55%", "15%", "15%", "15%"],
    headerLabels: {
      byKey: { sku: "Item", description: "Item" },
      byRole: { quantity: "Quantity", rate: "Rate", amount: "Amount" }
    },
    showTableTotalRow: false,
    separatePaymentPage: true
  }
};
