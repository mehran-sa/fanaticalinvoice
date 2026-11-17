/**
 * The Animal Care Alison. Matched to "Invoice_AC011.docx" (Bluebell Academy
 * Ltd, trading as The Animal Care, to Alison, Invoice# AC011, A4, Lucida Sans
 * Unicode with Arial Black).
 *
 * The logo top left with the brand name and company below; "INVOICE" and
 * "Invoice#" top right; Bill To with the dates right-aligned beside it; a
 * black-headed # / Item Description / Qty / Rate / TAX / Amount table with
 * ruled rows; Sub Total and Total payable; Payment Details; Terms &
 * Conditions; a rule near the foot of the page.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, FONTS, A4 } from "./kit.js";

const TEXT = "#333333";
const BLACK = `font-family:${FONTS.arialBlack}`;
const EMAIL = /([^\s@]+@[^\s@]+\.[^\s@]+)/;

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "MMMM DD, YYYY");

  const companyBlock = `<div style="${BLACK};font-size:9pt;line-height:14.1pt;color:${TEXT}">${or(company.name, "Your brand")}</div>` +
    `<div style="margin-top:2.2pt;font-size:12pt;line-height:17.5pt;color:${TEXT}">` +
      [...company.address, ...[company.phone, company.email].filter(Boolean)].map(esc).join("<br>") + `</div>`;

  const clientBlock = `<div style="font-size:10pt;line-height:15.4pt;color:${TEXT}">Bill To:</div>` +
    `<div style="margin-top:2.2pt;font-size:12pt;line-height:17.5pt">${or(client.name, "Client")}` +
      (client.address.length || client.email ? "<br>" + [...client.address, ...(client.email ? [client.email] : [])].map(esc).join("<br>") : "") + `</div>`;

  const dateLine = (label, value) => `<span style="font-size:10pt;color:${TEXT}">${label}</span><span style="font-size:12pt"> ${esc(value)}</span>`;

  // Columns: # | Item Description | Qty | Rate | TAX | Amount (edges 46.2,
  // 75.5, 273.1, 374.8, 452.9, 492 and 560.2pt).
  const widths = [29.3, 197.6, 101.7, 78.1, 39.1, 68.2];
  const colgroup = `<colgroup>${widths.map(w => `<col style="width:${w}pt">`).join("")}</colgroup>`;
  const head = `<tr style="height:24.6pt;background:#000;color:#EEEEEE">` +
    `<td style="padding:5.4pt 0 0 12.1pt">#</td><td style="padding:5.4pt 0 0 11.5pt">Item Description</td>` +
    `<td style="padding:5.4pt 0 0 76.3pt">Qty</td><td style="padding:5.4pt 0 0 25.5pt">Rate</td>` +
    `<td class="r" style="padding:5.4pt 15.7pt 0 0" colspan="2"><span style="margin-right:37.4pt">TAX</span>Amount</td></tr>`;
  const rows = ctx.items.map((item, i) =>
    `<tr style="height:42.2pt;border-bottom:1pt solid #000">` +
      `<td style="padding:7.3pt 0 0 12.3pt">${i + 1}</td>` +
      `<td style="padding:7.3pt 0 0 11.5pt">${esc(item.description)}</td>` +
      `<td style="padding:7.3pt 0 0 86pt">${esc(item.quantityText)}</td>` +
      `<td class="r" style="padding:7.3pt 22.5pt 0 0;white-space:nowrap" colspan="1">${esc(money(item.rate))}</td>` +
      `<td style="padding:7.3pt 0 0 3.7pt">${esc((ctx.totals.taxRate || 0).toFixed(2))}</td>` +
      `<td class="r" style="padding:7.3pt 7.1pt 0 0;white-space:nowrap">${esc(money(item.amount))}</td></tr>`).join("");
  const table = `<table style="width:514pt;font-size:9pt;line-height:13.8pt">${colgroup}${head}${rows}</table>`;

  const extra = adjustmentRows(ctx);
  const sum = (label, value, css) => `<tr><td class="r" style="width:402.9pt;${css}">${esc(label)}</td><td class="r" style="width:104.3pt;white-space:nowrap;${css}">${esc(money(value))}</td></tr>`;
  const sums = `<table style="font-size:9pt">` + sum("Sub Total", totals.subtotal, "line-height:13.8pt;padding-bottom:13.4pt") +
    extra.map(([l, v]) => sum(l, v, "line-height:13.8pt;padding-bottom:6pt")).join("") +
    sum("Total payable", totals.total, `${BLACK};line-height:12.7pt`).replace(`${BLACK};line-height:12.7pt">Total payable`, `${BLACK};font-size:8pt;line-height:12.7pt">Total payable`) + `</table>`;

  const linkify = line => esc(line).replace(EMAIL, `<span style="color:#0000FF;text-decoration:underline">$1</span>`);
  const payment = `<div style="font-size:10pt;line-height:15.4pt;color:${TEXT}">Payment Details:</div>` +
    ctx.payment.map((l, i) => `<div style="margin-top:${i ? 0 : 11.9}pt;font-size:10pt;line-height:15.4pt;color:${TEXT}">${l ? linkify(l) : "&nbsp;"}</div>`).join("") +
    (ctx.terms.length ? `<div style="margin-top:22.1pt;font-size:10pt;line-height:15.4pt;color:${TEXT}">Terms &amp; Conditions</div>` +
      `<div style="margin-top:4pt;font-size:8.5pt;line-height:13.1pt;color:${TEXT}">${ctx.terms.map(esc).join("<br>")}</div>` : "");

  return renderPage([
    { y: 52, items: [
      el(46.2, 52, logoImg(ctx, "width:184.7pt;height:123.5pt")),
      el(448.7, 54.7, "INVOICE", { css: "font-size:28.5pt;line-height:43.8pt" }),
      el(400, 92.1, "Invoice# " + esc(invoice.number), { w: 159.7, css: `${BLACK};font-size:9pt;line-height:14.1pt;color:${TEXT};text-align:right` }),
      el(46.2, 175.5, companyBlock, { w: 500 })
    ] },
    { y: 287, items: [
      el(46.2, 287, clientBlock, { w: 300 }),
      el(250, 331.8, dateLine("Invoice Date :", " " + date(invoice.date)), { w: 309.3, css: "text-align:right;line-height:18.4pt;white-space:nowrap" }),
      el(250, 353.2, dateLine("Due Date :", date(invoice.due)), { w: 309.3, css: "text-align:right;line-height:18.4pt;white-space:nowrap" })
    ] },
    { y: 388.6, items: [el(46.2, 388.6, table)] },
    { y: 506.1, items: [el(46.2, 506.1, sums)] },
    { y: 593.3, items: [el(45.5, 593.3, payment, { w: 520 })] },
    { y: 800.7, items: [el(45.5, 800.7, "", { w: 513.7, css: "height:0.8pt;background:#000" })] }
  ], { ...A4, font: FONTS.lucida });
}

export default alisonTemplate({
  id: "alison-animalcare",
  name: "The Animal Care",
  description: "The Animal Care (Bluebell Academy Ltd) invoice to Alison: black-headed # / Item Description / Qty / Rate / TAX / Amount table, Sub Total and Total payable, PayPal and terms.",
  paper: A4.paper,
  fontStack: "Lucida Sans Unicode + Arial Black",
  layout,
  // The academy's company, bank and PayPal details are kept encrypted in
  // js/secure/vault.js and filled in after the master password is entered.
  brand: { logo: "animalcare" }
});
