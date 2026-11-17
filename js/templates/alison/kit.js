/**
 * Shared pieces for the Alison templates (js/templates/alison/*.js).
 *
 * Each Alison template reproduces one academy's own invoice to Alison, as
 * supplied in Word. Those files were made from PDFs, so every line of text
 * sits at a known position on the page. A template here draws the whole page
 * itself (capabilities.layout) from the invoice data, placing each block at
 * the measured position, in points. The page still flows: more line items,
 * or a longer address, push what follows down instead of overlapping it.
 *
 * layoutContext() gathers the invoice data once per redraw; the helpers turn
 * it into text in each template's formats.
 */

import { $, esc, trimmedField, fieldValue, isIsoDate, num } from "../../utils.js";
import { state, roleCol } from "../../state.js";
import { getTotals, calculateItemValue, amountColumn } from "../../invoice/calculations.js";
import { money as appMoney, decimalText } from "../../invoice/formatters.js";
import { metaCompany } from "../../invoice/invoice-data.js";

export { esc };

/* ------------------------------------------------------------- text */

/** Lines of a multi-line field, trimmed, without leading or trailing blank lines. */
export function lines(text) {
  const all = String(text ?? "").split(/\r?\n/).map(s => s.trim());
  while (all.length && !all[0]) all.shift();
  while (all.length && !all[all.length - 1]) all.pop();
  return all;
}

/** Escaped text with line breaks kept. */
export const multiline = text => lines(text).map(esc).join("<br>");

/**
 * "Key: value" lines as {key, value}; a line without a colon has no key.
 * With columns: true, two or more spaces (or a tab) also separate the key
 * from the value, and the key is kept exactly as typed ("Sort Code:  600537"
 * shows "Sort Code:"), for tables whose labels mix both styles.
 */
export function keyValueRows(text, { columns = false } = {}) {
  return lines(text).filter(Boolean).map(line => {
    if (columns) {
      const m = /^(.+?)(?:\t+| {2,})(.+)$/.exec(line);
      if (m) return { key: m[1].trim(), value: m[2].trim() };
    }
    const at = line.indexOf(":");
    if (at <= 0) return { key: "", value: line };
    return { key: line.slice(0, at).trim(), value: line.slice(at + 1).trim() };
  });
}

/* ------------------------------------------------------------- dates */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August",
  "September", "October", "November", "December"];
const ordinal = d => d + ((d % 100 >= 11 && d % 100 <= 13) ? "th" : ["th", "st", "nd", "rd"][d % 10] || "th");

/**
 * Formats an ISO date with a pattern, as each academy writes it:
 *   D 7   DD 07   Do 7th   DDo 07th
 *   M 8   MM 08   MMM Aug   MMMM August
 *   YY 26   YYYY 2026
 * Other characters are kept. Not a date: the text as typed, or a dash.
 */
export function formatDate(value, pattern) {
  if (!isIsoDate(value)) return value ? String(value) : "—";
  const [y, m, d] = value.split("-").map(Number);
  const tokens = {
    YYYY: String(y), YY: String(y).slice(-2),
    MMMM: MONTHS[m - 1], MMM: MONTHS[m - 1].slice(0, 3), MM: String(m).padStart(2, "0"), M: String(m),
    DDo: String(d).padStart(2, "0") + ordinal(d).replace(/^\d+/, ""),
    Do: ordinal(d), DD: String(d).padStart(2, "0"), D: String(d)
  };
  return pattern.replace(/YYYY|YY|MMMM|MMM|MM|M|DDo|Do|DD|D/g, t => tokens[t]);
}

/* ------------------------------------------------------------- money */

/**
 * The invoice currency, formatted as the app does ("€2,891.24"), or with a
 * space after the symbol ("€ 433.53") where an original writes it so.
 */
export function money(value, { space = false } = {}) {
  const text = appMoney(value);
  return space ? text.replace(/^(-?)([^\d\s-]+)(?=\d)/, "$1$2 ") : text;
}

/* ------------------------------------------------------------ context */

const descriptionColumn = () =>
  state.columns.find(c => c.key === "description") ||
  state.columns.find(c => c.role === "none" && c.type === "text" && c.key !== "sku") ||
  state.columns.find(c => c.role === "none");

/**
 * Everything a template draws, read from the editor.
 * @returns {object}
 */
export function layoutContext() {
  const companyLines = lines(fieldValue("companyAddress"));
  const clientNameLines = lines(fieldValue("clientName"));
  const desc = descriptionColumn();
  const qty = roleCol("quantity");
  const rate = roleCol("rate");
  const amountCol = amountColumn();
  const items = state.items.map((item, index) => {
    const quantity = qty ? num(item[qty.key]) : 1;
    const rateValue = rate ? num(item[rate.key]) : calculateItemValue(item, amountCol);
    return {
      index,
      description: desc ? String(item[desc.key] ?? "") : "",
      quantity,
      quantityText: decimalText(quantity),
      rate: rateValue,
      amount: calculateItemValue(item, amountCol)
    };
  });
  const t = getTotals();
  return {
    company: {
      name: trimmedField("companyName"),
      reg: trimmedField("companyReg"),
      vat: trimmedField("companyVat"),
      address: companyLines,
      phone: trimmedField("companyPhone"),
      email: trimmedField("companyEmail"),
      website: trimmedField("companyWebsite"),
      /** The address block as the standard templates build it. */
      meta: metaCompany()
    },
    client: {
      name: clientNameLines[0] || "",
      /** Further lines typed in the client name box come before the address. */
      address: [...clientNameLines.slice(1), ...lines(fieldValue("clientAddress"))],
      contact: trimmedField("clientContact"),
      email: trimmedField("clientEmail"),
      tax: trimmedField("clientTax")
    },
    invoice: {
      number: trimmedField("invoiceNumber"),
      reference: trimmedField("reference"),
      date: fieldValue("invoiceDate"),
      due: fieldValue("dueDate")
    },
    items,
    totals: {
      subtotal: t.subtotal,
      discount: t.disc, discountRate: t.dr,
      tax: t.tax, taxRate: t.tr,
      shipping: t.ship,
      total: t.total
    },
    notes: lines(fieldValue("notes")),
    payment: lines(fieldValue("paymentDetails")),
    paymentText: trimmedField("paymentDetails"),
    terms: lines(fieldValue("terms")),
    logo: state.logo || "",
    sections: state.sections
  };
}

/**
 * Extra total rows (discount, tax, shipping) when they apply, so a template
 * that shows only "Total" still adds up. Each is [label, amount].
 */
export function adjustmentRows(ctx) {
  const t = ctx.totals;
  const rows = [];
  const pct = r => String(Number(r.toFixed(2)));
  if (t.discount && ctx.sections.discount !== false) rows.push([`Discount (${pct(t.discountRate)}%)`, -t.discount]);
  if (t.tax && ctx.sections.tax !== false) rows.push([`Tax (${pct(t.taxRate)}%)`, t.tax]);
  if (t.shipping && ctx.sections.shipping !== false) rows.push(["Shipping", t.shipping]);
  return rows;
}

/** The logo as an <img>, or nothing. */
export const logoImg = (ctx, style = "") =>
  ctx.logo ? `<img class="al-logo" src="${esc(ctx.logo)}" alt="" style="${style}">` : "";

/** True while the editor shows an empty element (for a muted placeholder). */
export const isEmpty = value => !String(value ?? "").trim();

/** Placeholder text for empty fields, so an empty invoice still shows the layout. */
export const or = (value, placeholder) => (isEmpty(value) ? `<span class="al-ph">${esc(placeholder)}</span>` : esc(value));

/** Positions an element: absolute top/left/width in points. */
export const at = (x, y, w) => `position:absolute;left:${x}pt;top:${y}pt${w ? `;width:${w}pt` : ""}`;

/** Lines joined as a block of divs. */
export const block = (arr, style = "") => arr.map(l => `<div style="${style}">${l ? esc(l) : "&nbsp;"}</div>`).join("");

/** Base capabilities shared by every Alison template (the standard renderer's flags). */
export const BASE_CAPABILITIES = {
  invoiceNoPrefix: "#",
  formatDate: v => v,
  companyMeta: metaCompany,
  structuredPayment: false,
  repairNoteTypo: false,
  hideReferenceRowWhenEmpty: true,
  paymentIgnoresSectionToggle: false,
  dropRateWhenAmount: false,
  dropSkuWhenDescription: true,
  fixedColumnWidths: null,
  headerLabels: null,
  showTableTotalRow: false,
  separatePaymentPage: false
};

/** Plain labels for the standard renderer (not drawn by Alison templates). */
export const BASE_LABELS = {
  title: "INVOICE", bill: "Bill To:", balance: "Balance Due:",
  note: "Notes:", payment: "Payment details", terms: "Terms",
  date: "Date:", due: "Due Date:", ref: "Reference:"
};

/**
 * Builds an Alison template descriptor.
 * @param {object} spec id, name (without "Alison"), description, paper,
 *        fontStack, layout(ctx) -> html, brand (the academy's details)
 */
export function alisonTemplate(spec) {
  return {
    id: spec.id,
    name: spec.name + " Alison",
    group: "alison",
    description: spec.description,
    cssClass: "template-" + spec.id,
    fontStack: spec.fontStack,
    labels: BASE_LABELS,
    capabilities: {
      ...BASE_CAPABILITIES,
      paper: spec.paper || "a4",
      layout: spec.layout,
      brand: spec.brand
    }
  };
}


/* ------------------------------------------------------------ layout */

/**
 * One element at its measured spot: x, y (page points, as in the Word file),
 * optional width w, inner html and extra css.
 */
export const el = (x, y, html, { w, css = "", cls = "" } = {}) => ({ x, y, w, html, css, cls });

/**
 * Lays the page out as sections, top to bottom. A section starts at the y of
 * its first element on the original page and is at least as tall as the gap
 * to the next section, so with content like the original every element lands
 * where it was. Inside a section, elements are stacked in one grid cell and
 * offset to their own x and y. A section grows to fit its tallest element,
 * so a longer address or more line items move what follows down rather than
 * overlapping it.
 *
 * @param {{y: number, items: object[], css?: string}[]} sections
 * @param {{width: number, height: number, font: string, css?: string}} page
 */
export function renderPage(sections, page) {
  const list = sections.filter(Boolean).filter(s => s.items.some(Boolean));
  const out = list.map((section, i) => {
    const next = list[i + 1];
    const min = next ? Math.max(0, next.y - section.y) : 0;
    const top = i === 0 ? `margin-top:${section.y}pt;` : "";
    const items = section.items.filter(Boolean).map(item =>
      `<div class="al-i${item.cls ? " " + item.cls : ""}" style="margin:${round(item.y - section.y)}pt 0 0 ${round(item.x)}pt;` +
      `${item.w ? `width:${round(item.w)}pt;` : ""}${item.css}">${item.html}</div>`).join("");
    return `<div class="al-sec" style="${top}min-height:${round(min)}pt;${section.css || ""}">${items}</div>`;
  }).join("");
  return `<div class="al-page" style="width:${page.width}pt;min-height:${page.height}pt;font-family:${page.font};${page.css || ""}">${out}</div>`;
}

const round = n => Math.round(n * 100) / 100;

/** Font stacks: the font named in the Word file first, then close equivalents. */
export const FONTS = {
  arial: "Arial, 'Liberation Sans', Arimo, Helvetica, sans-serif",
  times: "'Times New Roman', 'Liberation Serif', Tinos, Times, serif",
  calibri: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif",
  verdana: "Verdana, 'DejaVu Sans', Geneva, sans-serif",
  segoe: "'Segoe UI', 'Segoe UI Web', Inter, 'Helvetica Neue', Arial, sans-serif",
  lucida: "'Lucida Sans Unicode', 'Lucida Grande', 'Lucida Sans', 'DejaVu Sans', sans-serif",
  arialBlack: "'Arial Black', 'Arial Bold', Gadget, Arial, sans-serif",
  msSans: "'Microsoft Sans Serif', Tahoma, Arial, sans-serif",
  jost: "Jost, 'Futura PT', Futura, 'Century Gothic', sans-serif"
};

/** Letter and A4 page sizes in points. */
export const LETTER = { width: 612, height: 792, paper: "letter" };
export const A4 = { width: 595.3, height: 841.9, paper: "a4" };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lines of text at a fixed pitch (blank lines kept, as spacing). Options:
 *   pitch          line spacing in points
 *   heading(line)  true for lines drawn bold (for example "Bank Details")
 *   links          e-mail-only lines in blue, underlined, as Word shows them
 *   linkColor      the colour for those
 */
export function textLines(arr, { pitch, heading = () => false, links = false, linkColor = "#0000FF", css = "" } = {}) {
  return arr.map(line => {
    if (!line) return `<div style="height:${pitch}pt"></div>`;
    const isLink = links && EMAIL.test(line);
    const style = `line-height:${pitch}pt;${heading(line) ? "font-weight:700;" : ""}${isLink ? `color:${linkColor};text-decoration:underline;` : ""}${css}`;
    return `<div style="${style}">${esc(line)}</div>`;
  }).join("");
}

/** True for a heading line such as "Bank Details" or "PayPal Details". */
export const isDetailsHeading = line => /^[A-Za-z ]+Details:?$/.test(line.trim());

/**
 * Lines where a line ending in ":" is a muted label ("Bank Details:",
 * "PayPal:"), followed by its own lines.
 *   pitch     spacing between ordinary lines
 *   labelGap  spacing from a label to the line after it
 */
export function labelledLines(arr, { size, lineHeight, pitch, labelGap = pitch, labelColor, color = "", sectionGap = pitch } = {}) {
  let prev = null;
  let out = "";
  for (const line of arr) {
    if (!line) { prev = "blank"; continue; }
    const isLabel = /:$/.test(line);
    let gap = prev === null ? 0 : prev === "label" ? labelGap : prev === "blank" ? sectionGap + pitch : pitch;
    if (isLabel && prev !== null && prev !== "blank") gap = sectionGap + pitch;
    out += `<div style="margin-top:${prev === null ? 0 : Math.max(0, gap - lineHeight)}pt;line-height:${lineHeight}pt;${isLabel ? `color:${labelColor};` : color ? `color:${color};` : ""}">${esc(line)}</div>`;
    prev = isLabel ? "label" : "line";
  }
  return `<div style="font-size:${size}pt">${out}</div>`;
}

/**
 * A line-item table with a dark, rounded header bar (the Invoice Simple
 * style used by several academies). Column x positions are relative to the
 * table's left edge.
 */
export function darkItemsTable(ctx, o) {
  const cols = o.cols;
  const colgroup = (() => {
    let at = 0;
    let html = "";
    for (const c of cols) {
      if (c.x > at) html += `<col style="width:${c.x - at}pt">`;
      html += `<col style="width:${c.w}pt">`;
      at = c.x + c.w;
    }
    if (o.width > at) html += `<col style="width:${o.width - at}pt">`;
    return `<colgroup>${html}</colgroup>`;
  })();
  const alignCss = a => (a === "right" ? "text-align:right;" : a === "center" ? "text-align:center;" : "");
  const cells = (values, css = () => "", header = false) => {
    let at = 0;
    let html = "";
    cols.forEach((c, i) => {
      if (c.x > at) html += "<td></td>";
      const align = header && c.headerAlign ? c.headerAlign : c.align;
      html += `<td style="${alignCss(align)}${header && c.headerIndent ? `padding-left:${c.headerIndent}pt;` : ""}${css(c, i)}">${values[i]}</td>`;
      at = c.x + c.w;
    });
    if (o.width > at) html += "<td></td>";
    return html;
  };
  const header =
    `<div style="height:${o.headerHeight}pt;background:${o.color};border-radius:${o.radius ?? 2.5}pt;color:#fff">` +
      `<table style="width:${o.width}pt;font-size:${o.headerSize || o.fontSize}pt;line-height:${o.lineHeight}pt">${colgroup}` +
        `<tr>${cells(cols.map(c => esc(c.label)), c => `padding-top:${c.headerPad ?? o.headerPadTop}pt;white-space:nowrap`, true)}</tr></table></div>`;
  const rows = ctx.items.map(item =>
    `<tr style="height:${o.rowPitch}pt">${cells(cols.map(c => esc(c.value(item))), (c, i) =>
      (i === 0 && o.descBold ? "font-weight:700;" : "") + (i > 0 ? "white-space:nowrap;" : "") + (c.css || ""))}</tr>`).join("");
  const body = `<table style="width:${o.width}pt;margin-top:${o.firstRowGap}pt;font-size:${o.fontSize}pt;line-height:${o.lineHeight}pt;color:${o.textColor}">${colgroup}${rows}</table>`;
  const last = cols[cols.length - 1];
  const totals = (o.totals || []).map(([label, value], i) =>
    `<tr style="height:${o.totalPitch || o.rowPitch}pt">` +
      `<td style="width:${o.totalLabelRight}pt;text-align:right;color:${o.totalLabelColor || o.textColor};${o.totalLabelCss || ""}">${esc(label)}</td>` +
      `<td style="width:${last.x + last.w - o.totalLabelRight}pt;text-align:right;white-space:nowrap;${o.totalValueCss || ""}">${esc(money(value))}</td></tr>`).join("");
  const totalsTable = totals ? `<table style="margin-top:${o.totalsGap}pt;font-size:${o.fontSize}pt;line-height:${o.lineHeight}pt;color:${o.textColor}">${totals}</table>` : "";
  return header + body + totalsTable;
}

/* ------------------------------------------------------------ assets */

let assets = null;
let assetsLoading = null;

/**
 * An image kept with the Alison logos (for example a signature), or "" until
 * they have loaded; the preview is redrawn once they arrive.
 */
export function asset(key) {
  if (assets) return assets[key] || "";
  if (!assetsLoading) {
    assetsLoading = import("./logos.js")
      .then(m => { assets = m.default; return import("../../invoice/invoice-renderer.js"); })
      .then(r => r.renderPreview())
      .catch(err => console.error(err));
  }
  return "";
}

/** Paragraphs of a multi-line field, split at blank lines. */
export const paragraphs = arr => arr.join("\n").split(/\n\s*\n/).map(p => p.split("\n")).filter(p => p.some(Boolean));
