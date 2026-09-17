/**
 * Alpha / Fanatical Royalty statement.
 * Styling: css/templates/royalty.css
 *
 * Template-specific behaviour:
 *  - the Reference meta row is hidden when the field is empty
 *  - Rate is hidden when Amount is present (one money column: "Royalty")
 *  - repairs a known typo in the supplied Alpha invoice note
 */

import { dateFmt } from "../invoice/formatters.js";
import { metaCompany } from "../invoice/invoice-data.js";

export default {
  id: "royalty",
  name: "Alpha / Fanatical Royalty",
  cssClass: "template-royalty",
  fontStack: "Calibri Regular + Bold",
  labels: {
    title: "INVOICE", bill: "To:", status: "Status:", balance: "Balance Due:",
    note: "Invoice Note:", payment: "Payment Details:", terms: "Terms:",
    date: "Date:", due: "Due Date:", ref: "Reference:"
  },
  capabilities: {
    invoiceNoPrefix: "#",
    formatDate: dateFmt,
    companyMeta: metaCompany,
    structuredPayment: false,
    repairNoteTypo: true,
    hideReferenceRowWhenEmpty: true,
    paymentIgnoresSectionToggle: false,
    dropRateWhenAmount: true,
    dropSkuWhenDescription: false,
    // Fanatical royalty layout: SKU, Name, Net Qty, Royalty.
    fixedColumnWidths: ["20%", "50%", "12%", "18%"],
    headerLabels: {
      byKey: { sku: "SKU", description: "Name" },
      byRole: { quantity: "Net Qty", rate: "Royalty", amount: "Royalty" }
    },
    showTableTotalRow: false,
    separatePaymentPage: false
  }
};
