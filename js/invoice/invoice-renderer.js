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
  LIMITS, FIXED_WIDTH_COLUMN_COUNT, STATUS_STYLES, STATUS_STYLE_FALLBACK
} from "../constants.js";
import { state } from "../state.js";
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
  setText("fontHint", "PDF font stack: " + template.fontStack);
};

const renderLabels = ({ labels }) => {
  setText("pInvoiceTitle", labels.title);
  setText("pBillToLabel", labels.bill);
  setText("pStatusLabel", labels.status);
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
};

/** Payment details: bordered key/value table for One Education, plain text elsewhere. */
const renderPaymentDetails = (caps, paymentText) => {
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

const renderStatusBadge = () => {
  const status = fieldValue("status");
  const [color, background, borderColor] = STATUS_STYLES[status] || STATUS_STYLE_FALLBACK;
  const pill = $("pStatus");
  pill.textContent = "\u25cf " + status;
  pill.style.color = color;
  pill.style.background = background;
  pill.style.borderColor = borderColor;
};

/* -------------------------------------------------------- visibility */

const applySectionVisibility = (caps, { notesText, termsText, paymentText }) => {
  qsa("[data-section]")
    .forEach(el => el.classList.toggle("section-hidden", !state.sections[el.dataset.section]));

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
  const useFixed = caps.fixedColumnWidths && visible.length === FIXED_WIDTH_COLUMN_COUNT;
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
    if (String(c.key || "").toLowerCase() === "description") return `<td class="classic-total-label">Total</td>`;
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

const renderLogo = () => {
  setText("pLogoFallback", (trimmedField("companyName")[0] || "I").toUpperCase());

  const img = $("pLogo");
  const box = img.closest(".logobox");
  const width = clamp(num(fieldValue("logoWidth")) || LIMITS.logoWidth.fallback, LIMITS.logoWidth.min, LIMITS.logoWidth.max);
  const height = clamp(num(fieldValue("logoHeight")) || LIMITS.logoHeight.fallback, LIMITS.logoHeight.min, LIMITS.logoHeight.max);
  const align = fieldValue("logoAlign");

  box.style.width = width + "px";
  box.style.height = height + "px";
  img.style.objectFit = fieldValue("logoFit");
  img.style.objectPosition = align + " center";
  box.style.justifyContent = align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center";
  setText("logoWidthValue", width);
  setText("logoHeightValue", height);

  if (state.logo) {
    img.src = state.logo;
    box.classList.add("has-logo");
    img.style.display = "block";
    $("pLogoFallback").style.display = "none";
  } else {
    img.removeAttribute("src");
    box.classList.remove("has-logo");
    img.style.display = "none";
    $("pLogoFallback").style.display = "grid";
  }
};

const applyZoom = () => {
  const inv = $("invoice");
  inv.style.transform = `scale(${state.zoom})`;
  inv.style.transformOrigin = "top center";
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
  setText("pFooterCompany", fieldOr("companyName", "Your Company"));
  setText("pFooterInvoice", "Invoice #" + invoiceNo);

  renderStatusBadge();
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
}
