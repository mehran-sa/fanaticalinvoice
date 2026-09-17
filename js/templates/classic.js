/**
 * One Education Classic. Matched to the supplied
 * "One Education - Fanatical Invoice 2026-0228" PDF.
 * Styling: css/templates/classic.css
 *
 * Template-specific behaviour:
 *  - DD/MM/YYYY dates and an address block with no field prefixes
 *  - payment details render as a bordered key/value table
 *  - Rate is hidden when Amount is present (one money column: "Royalty")
 *  - a totals row is printed inside the items table
 *  - the table heading is not repeated across printed pages
 */

import { oneEducationDateFmt } from "../invoice/formatters.js";
import { oneEducationCompanyMeta } from "../invoice/invoice-data.js";

export default {
  id: "classic",
  name: "One Education Classic",
  cssClass: "template-classic",
  fontStack: "Arial / Liberation Sans",
  labels: {
    title: "Invoice", bill: "Bill To", status: "Status", balance: "Balance Due",
    note: "Notes", payment: "Payment Details:", terms: "Terms",
    date: "Date", due: "Due Date", ref: "Reference"
  },
  capabilities: {
    invoiceNoPrefix: "#",
    formatDate: oneEducationDateFmt,
    companyMeta: oneEducationCompanyMeta,
    structuredPayment: true,
    repairNoteTypo: false,
    hideReferenceRowWhenEmpty: false,
    paymentIgnoresSectionToggle: false,
    dropRateWhenAmount: true,
    dropSkuWhenDescription: false,
    // One Education statement: Description (SKU), Name, Net Qty, Royalty.
    fixedColumnWidths: ["13%", "64%", "11%", "12%"],
    headerLabels: {
      byKey: { sku: "Description", description: "Name" },
      byRole: { quantity: "Net Qty", rate: "Royalty", amount: "Royalty" }
    },
    showTableTotalRow: true,
    separatePaymentPage: false
  }
};
