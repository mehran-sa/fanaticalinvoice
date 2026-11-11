/**
 * Renders the invoice preview from state + the editor fields.
 *
 * This module only reads data and writes to the preview DOM. It never mutates
 * application state and never touches editor controls, with one deliberate
 * exception documented on the notes repair below.
 *
 * renderPreview() is the single entry point; the steps below run in a fixed
 * order because it matters: section visibility is applied wholesale from the
 * toggles first, then narrowed by the active template.
 */

import { $, qs, qsa, setText, toggleSection, fieldValue, fieldOr, trimmedField, num, esc, clamp } from "../utils.js";
import {
  LIMITS, FIXED_WIDTH_COLUMN_COUNT, CLIENT_META_FALLBACK, paperFor
} from "../constants.js";
import { state } from "../state.js";
import { renderWatermark } from "./watermark.js";
import * as TemplateRegistry from "../templates/template-registry.js";
import { fmtCell, money, ratePercentText, decimalText, alignClass } from "./formatters.js";
import { metaClient, oneEducationPaymentRows, readNotes } from "./invoice-data.js";
import {
  getTotals, calculateItemValue, calculateQuantityTotal
} from "./calculations.js";

/* ------------------------------------------------------------ chrome */

const applyTemplateChrome = (templateId, template) => {
  // The class string is built from the selected id, not the resolved template,
  // so an unknown id behaves exactly as it did before.
  $("invoice").className = "invoice template-" + templateId;
  setText("fontHint", template.description || "");
  applyPaper(paperFor(template));
};

/**
 * Sizes the preview page for the template's paper (A4 or US Letter) and keeps
 * a matching @page rule for printing the editor page itself (Ctrl+P). The
 * app's own Print and Export PDF set the page size in the print document.
 */
let appliedPaper = null;
const applyPaper = paper => {
  if (appliedPaper === paper.id) return;
  appliedPaper = paper.id;
  const root = document.documentElement.style;
  root.setProperty("--paper-w", paper.width + "mm");
  root.setProperty("--paper-h", paper.height + "mm");
  $("invoice").style.setProperty("--paper-w", paper.width + "mm");
  $("invoice").style.setProperty("--paper-h", paper.height + "mm");
  setText("previewMeta", paper.label + " portrait preview");
  let rule = document.getElementById("paperPageRule");
  if (!rule) {
    rule = document.createElement("style");
    rule.id = "paperPageRule";
    document.head.appendChild(rule);
  }
  rule.textContent = `@media print{@page{size:${paper.width}mm ${paper.height}mm;margin:0}}`;
};

const renderLabels = ({ labels }) => {
  setText("pInvoiceTitle", labels.title);
  setText("pBillToLabel", labels.bill);
  setText("pBalanceLabel", labels.balance);
  setText("pNoteLabel", labels.note);
  setText("pPaymentLabel", labels.payment);
  setText("pTermsLabel", labels.terms);

  const metaLabels = [
    ['.metatable tr[data-section="invoiceDate"] td:first-child', labels.date],
    ['.metatable tr[data-section="dueDate"] td:first-child', labels.due],
    ['.metatable tr[data-section="reference"] td:first-child', labels.ref]
  ];
  for (const [selector, text] of metaLabels) {
    const cell = qs(selector);
    if (cell) cell.textContent = text;
  }
};

/* ------------------------------------------------------------ header */

const renderHeaderDetails = (caps, invoiceNo) => {
  setText("pCompanyName", fieldOr("companyName", "Your Company"));
  setText("pCompanyMeta", caps.companyMeta());
  setText("pInvoiceNo", caps.invoiceNoPrefix + invoiceNo);
  setText("pClassicInvoiceNo", invoiceNo);
  setText("pDate", caps.formatDate(fieldValue("invoiceDate")));
  setText("pDue", caps.formatDate(fieldValue("dueDate")));
  setText("pReference", fieldOr("reference", "\u2014"));
  setText("pClientName", fieldOr("clientName", "Client company"));
  setText("pClientMeta", metaClient());
  if (caps.clientFirstLineBold) {
    // Only the first line of the client name is bold; further name lines
    // ("Focus Multimedia Ltd") print with the address.
    const [first, ...rest] = trimmedField("clientName").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const meta = metaClient();
    setText("pClientName", first || "Client company");
    setText("pClientMeta", [...rest, meta === CLIENT_META_FALLBACK && rest.length ? "" : meta].filter(Boolean).join("\n"));
  }
  setText("pPeriodTitle", caps.periodTitle ? caps.periodTitle() : "");
};

/**
 * UKHF Fanatical payment block: "PayPal Details: ..." lines in bold-label
 * form, then "Bank Details:" and the remaining "Label: value" lines as a boxed
 * table. A line reading just "Bank Details" is taken as the heading itself.
 */
const UKHF_KNOWN_LABELS = new RegExp("^((?:pay\\s*pal(?:\\s+details)?|account\\s+name|account\\s+(?:number|no\\.?)|a\\s*/\\s*c\\s*(?:no\\.?|number)|bank\\s+name|bank\\s+branch|branch|sort\\s+code|swift(?:\\s*/\\s*bic)?|wwift\\s*/\\s*bic|bic|iban)\\s*:?)\\s+(.+)$", "i");

const ukhfPaymentMarkup = text => {
  // One row per line. "Label: value" keeps the colon as typed ("Sort Code:");
  // a tab, two or more spaces, or " | " separate without one ("IBAN").
  const rows = String(text || "").split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    // Common bank labels are recognised even without a separator
    // ("Account Name Edukators London Ltd", "Sort Code 309897").
    const known = line.match(UKHF_KNOWN_LABELS);
    if (known && known[2]) return { label: known[1].trim(), value: known[2].trim() };
    const plain = line.match(/^(.*?\S)(?:\t+| {2,}| \| )(.+)$/);
    if (plain) return { label: plain[1].trim(), value: plain[2].trim() };
    const colon = line.indexOf(":");
    if (colon > 0) return { label: line.slice(0, colon + 1).trim(), value: line.slice(colon + 1).trim() };
    return { label: "", value: line };
  });
  const isPaypal = r => /paypal/i.test(r.label);
  const isBankHeading = r => /^bank\s*details:?$/i.test(r.label || r.value) && !(r.label && r.value);
  const lines = rows.filter(r => isPaypal(r) || (!r.label && !isBankHeading(r)));
  const bank = rows.filter(r => r.label && !isPaypal(r) && !isBankHeading(r));
  const lineHtml = lines.map(r => r.label
    ? `<div class="ukhf-pay-line"><strong>PayPal Details:</strong> ${esc(r.value)}</div>`
    : `<div class="ukhf-pay-line">${esc(r.value)}</div>`).join("");
  const bankHtml = bank.length
    ? `<div class="ukhf-bank-title">Bank Details:</div><table class="ukhf-bank">${bank.map(r =>
      `<tr><td>${esc(r.label)}</td><td>${esc(r.value)}</td></tr>`).join("")}</table>`
    : "";
  return lineHtml + bankHtml;
};

/** Payment details: bordered key/value table for One Education, plain text elsewhere. */
const renderPaymentDetails = (caps, paymentText) => {
  if (caps.paymentLayout === "ukhf") {
    $("pPayment").innerHTML = ukhfPaymentMarkup(paymentText);
    return;
  }
  if (!caps.structuredPayment) {
    $("pPayment").textContent = paymentText;
    return;
  }
  $("pPayment").innerHTML = oneEducationPaymentRows(paymentText)
    .map(row => `<div class="oe-payment-row ${row.key ? "" : "oe-payment-free"}">` +
      (row.key ? `<div class="oe-payment-key">${esc(row.key)}</div>` : "") +
      `<div class="oe-payment-value">${esc(row.value)}</div></div>`)
    .join("");
};

/* -------------------------------------------------------- visibility */

const applySectionVisibility = (caps, { notesText, termsText, paymentText }) => {
  qsa("[data-section]")
    .forEach(el => el.classList.toggle("section-hidden", !state.sections[el.dataset.section]));

  // "Without a logo, show: Nothing" hides the placeholder box (with the
  // company's initial) exactly as switching off the Logo section does.
  if (!state.logo && fieldValue("logoFallback") === "none") {
    qsa('[data-section="logo"]').forEach(el => el.classList.add("section-hidden"));
  }

  if (caps.hideReferenceRowWhenEmpty) {
    toggleSection(qs('.metatable tr[data-section="reference"]'),
      state.sections.reference && Boolean(trimmedField("reference")));
  }

  toggleSection(qs('[data-section="notes"]'), state.sections.notes && Boolean(notesText));
  toggleSection(qs('[data-section="terms"]'), state.sections.terms && Boolean(termsText));

  const paymentSection = qs('[data-section="payment"]');
  toggleSection(paymentSection, state.sections.payment && Boolean(paymentText));
  if (caps.paymentIgnoresSectionToggle) toggleSection(paymentSection, Boolean(paymentText));
};

/* ------------------------------------------------------------- table */

/**
 * Columns actually rendered. Templates that print a single money column drop
 * the redundant one rather than showing two identical headings.
 */
const visibleColumns = caps => {
  let visible = state.columns.filter(c => c.visible);

  if (caps.dropRateWhenAmount) {
    const amountCol = visible.find(c => c.role === "amount");
    const rateCol = visible.find(c => c.role === "rate");
    if (amountCol && rateCol) visible = visible.filter(c => c !== rateCol);
  }

  if (caps.dropSkuWhenDescription) {
    const desc = visible.find(c => String(c.key).toLowerCase() === "description");
    const sku = visible.find(c => String(c.key).toLowerCase() === "sku");
    if (desc && sku) visible = visible.filter(c => c !== sku);
  }

  return visible;
};

const renderColgroup = (caps, visible) => {
  // Fixed widths apply when the template lists one width per visible column
  // (Alpha Academy Fanatical: 4, UKHF Fanatical: 3).
  const useFixed = Array.isArray(caps.fixedColumnWidths) && caps.fixedColumnWidths.length === visible.length;
  $("pCols").innerHTML = useFixed
    ? caps.fixedColumnWidths.map(width => `<col style="width:${width}">`).join("")
    : visible.map(c => `<col style="width:${Math.max(LIMITS.columnWidth.min, num(c.width))}%">`).join("");
};

/**
 * Heading for one column. Templates override by column key first, then by
 * calculation role; otherwise the user's own heading is used.
 */
const headerLabelFor = (caps, col) => {
  const overrides = caps.headerLabels;
  if (overrides) {
    const byKey = overrides.byKey[String(col.key || "").toLowerCase()];
    if (byKey) return byKey;
    const byRole = overrides.byRole[col.role];
    if (byRole) return byRole;
  }
  return col.label;
};

const renderTableHead = (caps, visible) => {
  $("pHeaders").innerHTML = visible
    .map(c => `<th class="${alignClass(c)}">${esc(headerLabelFor(caps, c))}</th>`)
    .join("");
};

const renderTableBody = visible => {
  const body = $("pItems");
  body.innerHTML = "";
  if (!state.items.length) {
    body.innerHTML = `<tr><td class="empty" colspan="${Math.max(1, visible.length)}">No line items added.</td></tr>`;
    return;
  }
  for (const item of state.items) {
    const tr = document.createElement("tr");
    tr.innerHTML = visible
      .map(c => `<td class="${alignClass(c)}">${fmtCell(calculateItemValue(item, c), c)}</td>`)
      .join("");
    body.appendChild(tr);
  }
};

/** One Education prints a totals row inside the items table itself. */
const renderTableTotalRow = (caps, visible, totals) => {
  const foot = $("pClassicTotals");
  if (!foot) return;
  if (!caps.showTableTotalRow || !state.items.length) {
    foot.innerHTML = "";
    return;
  }
  const qtyTotal = calculateQuantityTotal(state.items);
  const cells = visible.map(c => {
    if (String(c.key || "").toLowerCase() === "description") return `<td class="classic-total-label">${esc(caps.tableTotalLabel || "Total")}</td>`;
    if (c.role === "quantity") return `<td class="classic-total-qty">${decimalText(qtyTotal)}</td>`;
    if (c.role === "amount" || c.role === "rate") return `<td class="classic-total-money">${money(totals.subtotal)}</td>`;
    return `<td></td>`;
  }).join("");
  foot.innerHTML = `<tr class="classic-total-row">${cells}</tr>`;
};

/* ----------------------------------------------------------- summary */

const renderSummary = totals => {
  setText("pSubtotal", money(totals.subtotal));
  setText("discountLabel", `Discount (${ratePercentText(totals.dr)}%)`);
  setText("pDiscount", "\u2212" + money(totals.disc));
  setText("taxLabel", `Tax (${ratePercentText(totals.tr)}%)`);
  setText("pTax", money(totals.tax));
  setText("pShipping", money(totals.ship));
  setText("pTotal", money(totals.total));
  setText("pBalance", money(totals.total));

  $("discountRow").style.display = totals.disc && state.sections.discount ? "flex" : "none";
  $("taxRow").style.display = totals.tax && state.sections.tax ? "flex" : "none";
  $("shippingRow").style.display = totals.ship && state.sections.shipping ? "flex" : "none";
};

/* -------------------------------------------------------------- logo */

/** The logo currently set on the preview image (by reference). */
let renderedLogo = null;

const renderLogo = () => {
  setText("pLogoFallback", (trimmedField("companyName")[0] || "I").toUpperCase());

  const img = $("pLogo");
  const box = img.closest(".logobox");
  const width = clamp(num(fieldValue("logoWidth")) || LIMITS.logoWidth.fallback, LIMITS.logoWidth.min, LIMITS.logoWidth.max);
  const height = clamp(num(fieldValue("logoHeight")) || LIMITS.logoHeight.fallback, LIMITS.logoHeight.min, LIMITS.logoHeight.max);
  const align = fieldValue("logoAlign");

  box.style.width = width + "px";
  box.style.height = height + "px";
  // Without a logo the placeholder (the company's initial) is a square box,
  // not a wide empty frame with the letter squeezed into one side.
  if (!state.logo) box.style.width = Math.min(width, height) + "px";
  img.style.objectFit = fieldValue("logoFit");
  img.style.objectPosition = align + " center";
  box.style.justifyContent = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  setText("logoWidthValue", width);
  setText("logoHeightValue", height);

  // The editor's Remove button only makes sense when there is a logo.
  const removeButton = $("removeLogoBtn");
  if (removeButton) removeButton.hidden = !state.logo;

  if (state.logo) {
    // Only reassign when the logo changed: re-setting a multi-megabyte data
    // URL on every render (every keystroke) made the image decode again.
    if (renderedLogo !== state.logo) {
      img.src = state.logo;
      renderedLogo = state.logo;
    }
    box.classList.add("has-logo");
    img.style.display = "block";
    $("pLogoFallback").style.display = "none";
  } else {
    img.removeAttribute("src");
    renderedLogo = null;
    box.classList.remove("has-logo");
    img.style.display = "none";
    $("pLogoFallback").style.display = "grid";
  }
};

/**
 * Scales the preview. The page is wrapped in a stage that takes the scaled
 * size: transform alone left the layout at full A4 width, so a zoomed-out page
 * sat off-centre and small screens scrolled sideways.
 */
export const applyZoom = () => {
  const inv = $("invoice");
  const stage = $("invoiceStage");
  inv.style.transform = `scale(${state.zoom})`;
  inv.style.transformOrigin = "top left";
  if (stage) {
    stage.style.width = inv.offsetWidth * state.zoom + "px";
    stage.style.height = inv.offsetHeight * state.zoom + "px";
  }
  setText("zoomLabel", Math.round(state.zoom * 100) + "%");
};

/* ------------------------------------------------------------- entry */

/** Rebuilds the entire A4 preview from the current form values and state. */
export function renderPreview() {
  const templateId = fieldValue("template");
  const template = TemplateRegistry.get(templateId);
  const caps = template.capabilities;

  applyTemplateChrome(templateId, template);
  renderLabels(template);

  const invoiceNo = fieldOr("invoiceNumber", "Untitled");
  renderHeaderDetails(caps, invoiceNo);

  // The Alpha note repair writes the corrected text back into the editor so the
  // fix is persisted once rather than re-applied on every render. This is the
  // renderer's only write outside the preview, and is intentional.
  const notes = readNotes(caps.repairNoteTypo);
  if (notes.repaired) $("notes").value = notes.text;
  const notesText = notes.text;
  const termsText = trimmedField("terms");
  const paymentText = trimmedField("paymentDetails");

  $("pNotes").textContent = notesText;
  renderPaymentDetails(caps, paymentText);
  $("pTerms").textContent = termsText;
  setText("pFooterCompany", caps.footerText ? caps.footerText() : fieldOr("companyName", "Your Company"));
  setText("pFooterInvoice", caps.footerText ? "" : "Invoice #" + invoiceNo);

  applySectionVisibility(caps, { notesText, termsText, paymentText });

  const visible = visibleColumns(caps);
  renderColgroup(caps, visible);
  renderTableHead(caps, visible);
  renderTableBody(visible);

  const totals = getTotals();
  renderTableTotalRow(caps, visible, totals);
  renderSummary(totals);

  renderLogo();
  applyZoom();
  // Last: the watermark is sized from the rendered page height.
  renderWatermark(template);
}
