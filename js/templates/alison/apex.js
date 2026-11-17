/**
 * Apex Learning Alison. Matched to "Q2 Invoice for 2026 - Apex Learning UK
 * (1).docx" (Apex Learning to Alison, invoice INA13625, A4, Arial headings
 * and Calibri text, slate blue accents).
 *
 * "Invoice" top left (drawn as on the original), the logo top right; the
 * company with its e-mail as a link; "To" Alison; Invoice no and Invoice
 * Date; a bordered Name / Net Quantity / Amount table with a sum row; a large
 * "Total:"; Payment Details in italic slate blue.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, asset, FONTS, A4 } from "./kit.js";

const SLATE = "#34465F";
const CAL = `font-family:${FONTS.calibri}`;
const LINE = "1pt solid #000";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "DD/MM/YYYY");
  const heading = t => `<div style="font-size:12pt;line-height:13.4pt;font-weight:700;color:${SLATE}">${t}</div>`;

  const title = asset("apex-title");
  const companyBlock = heading(or(company.name, "Your company")) +
    `<div style="${CAL};font-size:11pt;line-height:13.6pt;margin-top:4.3pt">` +
      [...company.address, ...(company.phone ? [company.phone] : [])].map(l => `<div>${esc(l)}</div>`).join("") +
      (company.email ? `<div style="color:#0000FF;text-decoration:underline">${esc(company.email)}</div>` : "") + `</div>`;

  const clientBlock = heading("To") + `<div style="margin-top:5.7pt">${heading(or(client.name, "Client"))}</div>` +
    `<div style="${CAL};font-size:11pt;line-height:13.6pt;margin-top:5.4pt">${[...client.address, ...(client.email ? [client.email] : [])].map(l => `<div>${esc(l)}</div>`).join("")}</div>`;

  const meta = (label, value) => `<div style="${CAL};font-size:11pt;line-height:13.4pt;font-weight:700">${label}</div>` +
    `<div style="${CAL};font-size:12pt;line-height:14.6pt;color:#1F4679">${esc(value)}</div>`;

  const colgroup = `<colgroup><col style="width:361.9pt"><col style="width:80.9pt"><col style="width:80.9pt"></colgroup>`;
  const extra = adjustmentRows(ctx);
  const table = `<table style="width:523.7pt;border:${LINE}">${colgroup}` +
    `<tr style="height:27.1pt;font-size:10pt;line-height:11.2pt;font-weight:700"><td style="border:${LINE};padding:10.5pt 0 0 175.8pt">Name</td><td style="border:${LINE};padding:10.5pt 0 0 13.3pt;white-space:nowrap">Net Quantity</td><td style="border:${LINE};padding:10.5pt 0 0 22.8pt">Amount</td></tr>` +
    ctx.items.map(item => `<tr style="height:31.4pt">` +
      `<td style="border:${LINE};padding:0.4pt 0 0 9.8pt;${CAL};font-size:10pt;line-height:12.2pt;font-weight:700">${esc(item.description)}</td>` +
      `<td style="border:${LINE};padding:11pt 0 0 44.5pt;font-size:10pt;line-height:11.2pt">${esc(item.quantityText)}</td>` +
      `<td style="border:${LINE};padding:12.5pt 0 0 22.8pt;${CAL};font-size:11pt;line-height:13.4pt;white-space:nowrap">${esc(money(item.amount))}</td></tr>`).join("") +
    extra.map(([l, v]) => `<tr style="height:22.7pt"><td class="r" style="border:${LINE};padding:0.2pt 6pt 0 0;${CAL};font-size:11pt;line-height:13.4pt">${esc(l)}</td><td style="border:${LINE}"></td>` +
      `<td style="border:${LINE};padding:0.2pt 0 0 22.8pt;${CAL};font-size:11pt;line-height:13.4pt;white-space:nowrap">${esc(money(v))}</td></tr>`).join("") +
    `<tr style="height:22.7pt"><td style="border:${LINE}"></td><td style="border:${LINE}"></td><td style="border:${LINE};padding:0.2pt 0 0 22.8pt;${CAL};font-size:11pt;line-height:13.4pt;white-space:nowrap">${esc(money(totals.total, { space: true }))}</td></tr></table>`;

  const total = `<div style="${CAL};font-size:18pt;line-height:22pt;font-weight:700;white-space:nowrap">Total: ${esc(money(totals.total, { space: true }))}</div>`;

  const payment = ctx.payment.length ? `<div style="${CAL};font-size:10pt;line-height:12.2pt;font-style:italic;color:#A6A6A6;margin-left:-3pt">Payment Details:</div>` +
    `<div style="${CAL};font-size:11pt;line-height:13.5pt;font-style:italic;color:${SLATE};margin-top:1.2pt">${ctx.payment.map(l => (l ? esc(l) : "&nbsp;")).join("<br>")}</div>` : "";

  return renderPage([
    { y: 38, items: [
      el(338.6, 38, logoImg(ctx, "width:209.2pt;height:45.9pt")),
      el(46.2, 42.8, title ? `<img src="${title}" alt="Invoice" style="display:block;width:87.9pt;height:22.1pt">` : `<div style="font-size:22pt;line-height:22.1pt;color:${SLATE}">Invoice</div>`),
      el(43.7, 106.6, companyBlock, { w: 400 })
    ] },
    { y: 210.9, items: [el(44.6, 210.9, clientBlock, { w: 400 })] },
    { y: 307.6, items: [
      el(46.6, 308.5, meta("Invoice no", invoice.number), { w: 200 }),
      el(254.7, 307.6, meta("Invoice Date", date(invoice.date)), { w: 200 })
    ] },
    { y: 357.9, items: [el(46.3, 357.9, table)] },
    { y: 494.3, items: [el(355, 494.3, total)] },
    { y: 629.9, items: [el(43.7, 629.9, payment, { w: 520 })] }
  ], { ...A4, font: FONTS.arial });
}

export default alisonTemplate({
  id: "alison-apex",
  name: "Apex Learning",
  description: "Apex Learning invoice to Alison: slate blue headings, bordered Name / Net Quantity / Amount table, large Total, italic Payment Details.",
  paper: A4.paper,
  fontStack: "Arial + Calibri",
  layout,
  // The academy's company, bank and PayPal details are kept encrypted in
  // js/secure/vault.js and filled in after the master password is entered.
  brand: { logo: "apex" }
});
