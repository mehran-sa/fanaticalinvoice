/**
 * UKHF Fanatical. Matched to the supplied Academy for Health & Fitness
 * invoice to Fanatical (FNT 2026, invoice #2026-3080, September 2026).
 * Styling: css/templates/ukhf.css
 *
 * Layout, as on the original:
 *  - large logo top left; "INVOICE", "Date: 13-Oct-2026" and
 *    "INVOICE #2026-3080" top right
 *  - "Invoice for September 2026": the Reference / PO field when filled,
 *    otherwise the month before the invoice date
 *  - your company (bold name, "Reg.no:", "Address:" on one line) on the left,
 *    the client on the right with only its first line in bold
 *  - a bordered table: Bundle Name, Net Qty, Royalty, ending "Total ="
 *  - "PayPal Details:" on one line, then "Bank Details:" as a boxed table
 *  - "Thank you for your Partnership!" (the Terms field when filled)
 *  - the logo, large and faint, as a watermark behind the page
 *  - fonts as on the original: Verdana for the INVOICE block, "Invoice for",
 *    and the bank table; Calibri for everything else; Times New Roman for
 *    the closing line
 *
 * Prints on US Letter, like the original (capabilities.paper).
 */

import { fieldValue, trimmedField, isIsoDate } from "../utils.js";
import { COMPANY_META_FALLBACK } from "../constants.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];

/** "13-Oct-2026", as printed on the original. */
export function ukhfDate(value) {
  if (!isIsoDate(value)) return value ? String(value) : "\u2014";
  const [y, m, d] = value.split("-").map(Number);
  return `${String(d).padStart(2, "0")}-${MONTHS[m - 1]}-${y}`;
}

/**
 * "Invoice for September 2026". Royalty statements are invoiced the month
 * after, so the default is the month before the invoice date; anything typed
 * in Reference / PO is used instead.
 */
export function ukhfPeriodTitle() {
  const reference = trimmedField("reference");
  if (reference) return "Invoice for " + reference;
  const date = fieldValue("invoiceDate");
  if (!isIsoDate(date)) return "Invoice";
  let [y, m] = date.split("-").map(Number);
  m -= 1;
  if (m === 0) { m = 12; y -= 1; }
  return `Invoice for ${MONTHS_LONG[m - 1]} ${y}`;
}

/** "Reg.no: 12389626" and "Address: 163 City Road, London, ..." on one line. */
export function ukhfCompanyMeta() {
  const lines = [];
  const reg = trimmedField("companyReg");
  const address = trimmedField("companyAddress").split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(", ");
  if (reg) lines.push("Reg.no: " + reg);
  if (address) lines.push("Address: " + address);
  for (const [id, label] of [["companyVat", "VAT"], ["companyPhone", "Tel"], ["companyEmail", "Email"], ["companyWebsite", "Web"]]) {
    const value = trimmedField(id);
    if (value) lines.push(`${label}: ${value}`);
  }
  return lines.join("\n") || COMPANY_META_FALLBACK;
}

export default {
  id: "ukhf",
  name: "UKHF Fanatical",
  description: "Academy for Health & Fitness royalty invoice to Fanatical: bundle table with a Total row, PayPal and bank details, and the logo as a watermark.",
  cssClass: "template-ukhf",
  fontStack: "Calibri / Carlito",
  labels: {
    title: "INVOICE", bill: "", balance: "Balance due:",
    note: "Note:", payment: "", terms: "",
    date: "Date:", due: "Due date:", ref: "Reference:"
  },
  capabilities: {
    /** US Letter, as the original. */
    paper: "letter",
    invoiceNoPrefix: "INVOICE #",
    formatDate: ukhfDate,
    companyMeta: ukhfCompanyMeta,
    structuredPayment: false,
    paymentLayout: "ukhf",
    repairNoteTypo: false,
    hideReferenceRowWhenEmpty: true,
    paymentIgnoresSectionToggle: false,
    dropRateWhenAmount: true,
    dropSkuWhenDescription: true,
    fixedColumnWidths: ["60%", "21%", "19%"],
    headerLabels: {
      byKey: { description: "Bundle Name" },
      byRole: { quantity: "Net Qty", rate: "Royalty", amount: "Royalty" }
    },
    showTableTotalRow: true,
    tableTotalLabel: "Total =",
    separatePaymentPage: false,
    periodTitle: ukhfPeriodTitle,
    clientFirstLineBold: true,
    footerText: () => trimmedField("terms") || "Thank you for your Partnership!",
    watermark: true,
    /**
     * Applied when this template is chosen, only to settings still at the
     * app's defaults, so nothing you have set yourself is overwritten.
     */
    defaultsOnSelect: {
      // The original's watermark is the logo, enlarged and very faint.
      watermark: { watermarkType: "logo", watermarkSize: "95", watermarkAngle: "0", watermarkOpacity: "12", watermarkLayout: "centred" },
      // 44.5 x 33.3mm, as on the original.
      logo: { logoWidth: "168", logoHeight: "126", logoFit: "contain", logoAlign: "left" }
    }
  }
};
