/**
 * CourseGate Alison. Matched to "Invoice CRG2603 (1).docx" (Edukite Ltd,
 * trading as CourseGate, to Alison, # CRG2603, US Letter, Microsoft Sans
 * Serif with Arial bold names).
 *
 * Logo top left, "INVOICE" and the number top right; the company, then Bill
 * To; dates and a grey Balance Due bar on the right; a dark rounded Item /
 * Quantity / Rate / Amount header; Total; PayPal.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, darkItemsTable, labelledLines, FONTS, LETTER } from "./kit.js";

const MUTED = "#767676";
const TEXT = "#333333";
const BOLD = `font-family:${FONTS.arial};font-weight:700`;

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "MMM D, YYYY");
  const right = (x0, x1, y, html, css) => el(x0, y, html, { w: x1 - x0, css: "text-align:right;white-space:nowrap;" + css });

  const companyBlock = `<div style="font-size:9.5pt;line-height:10.8pt;color:${TEXT}">` +
    `<div style="${BOLD};line-height:10.6pt">${or(company.name, "Your company")}</div>` +
    [...company.address, ...(company.phone ? [company.phone] : []), ...(company.email ? [company.email] : [])]
      .map((l, i) => `<div style="margin-top:${i === 0 ? 0.3 : 1.5}pt">${esc(l)}</div>`).join("") + `</div>`;

  const clientBlock = `<div style="font-size:9.5pt;line-height:10.8pt">` +
    `<div style="color:${MUTED}">Bill To:</div>` +
    `<div style="margin-top:5pt;${BOLD};line-height:10.6pt;color:${TEXT}">${or(client.name, "Client")}</div>` +
    [...client.address, ...(client.email ? [client.email] : [])].map(l => `<div style="margin-top:1.3pt;color:${TEXT}">${esc(l)}</div>`).join("") + `</div>`;

  const extra = adjustmentRows(ctx);
  const table = darkItemsTable(ctx, {
    width: 553.5, headerHeight: 21, color: "#3A3A3A", fontSize: 9.5, lineHeight: 10.8, headerPadTop: 4.1,
    firstRowGap: 7.5, rowPitch: 17, textColor: TEXT,
    cols: [
      { label: "Item", x: 15.4, w: 328.7, value: i => i.description, css: `${BOLD};line-height:10.6pt` },
      { label: "Quantity", x: 344.1, w: 70, value: i => i.quantityText },
      { label: "Rate", x: 414.1, w: 51.2, align: "right", value: i => money(i.rate) },
      { label: "Amount", x: 465.3, w: 72.3, align: "right", value: i => money(i.amount), css: "color:#000" }
    ],
    totalsGap: 83.4 - 17,
    totals: [...(extra.length ? [["Subtotal:", totals.subtotal], ...extra.map(([l, v]) => [l + ":", v])] : []), ["Total:", totals.total]],
    totalLabelRight: 438.1, totalLabelColor: MUTED, totalValueCss: "color:#000;padding-right:0;position:relative;left:4pt"
  });

  return renderPage([
    { y: 15, items: [
      el(36.8, 15, logoImg(ctx, "width:141.3pt;height:41.4pt")),
      el(461.4, 22.2, "INVOICE", { css: "font-size:27.5pt;line-height:31.1pt;color:#393939" }),
      right(380, 572, 56.4, "# " + esc(invoice.number), `font-size:12pt;line-height:13.6pt;color:${MUTED}`),
      el(48, 73.7, companyBlock, { w: 330 }),
      right(300, 461.6, 109, "Date:", `font-size:9.5pt;line-height:10.8pt;color:${MUTED}`),
      right(470, 566.4, 108.7, esc(date(invoice.date)), `font-size:9.5pt;line-height:10.8pt;color:${TEXT}`),
      right(300, 461, 130.6, "Due Date:", `font-size:9.5pt;line-height:10.8pt;color:${MUTED}`),
      right(470, 566.4, 130.5, esc(date(invoice.due)), `font-size:9.5pt;line-height:10.8pt;color:${TEXT}`),
      el(48, 124.5, clientBlock, { w: 260 }),
      el(317.2, 148.5, "", { w: 269.2, css: "height:25.5pt;background:#F5F5F5;border-radius:2pt" }),
      right(300, 461, 153.6, "Balance Due:", `font-size:11pt;line-height:12.3pt;${BOLD};color:${TEXT}`),
      right(470, 566.7, 153.6, esc(money(totals.total)), `font-size:11pt;line-height:12.3pt;${BOLD}`)
    ] },
    { y: 210.5, items: [el(29.2, 210.5, table)] },
    { y: 377.2, items: [el(48, 377.2, labelledLines(ctx.payment, { size: 9.5, lineHeight: 10.8, pitch: 13.5, labelGap: 16.5, labelColor: MUTED, color: TEXT }), { w: 540 })] }
  ], { ...LETTER, font: FONTS.msSans });
}

export default alisonTemplate({
  id: "alison-coursegate",
  name: "CourseGate",
  description: "CourseGate (Edukite Ltd) invoice to Alison: grey Balance Due bar, dark rounded Item / Quantity / Rate / Amount header, PayPal details.",
  paper: LETTER.paper,
  fontStack: "Microsoft Sans Serif + Arial",
  layout,
  brand: {
    logo: "coursegate",
    fields: {
      companyName: "EDUKITE LTD",
      companyAddress: "Flat 202 Pavilion House 10 Hemming Street London\nE15BL",
      currency: "EUR",
      paymentDetails: "PayPal::\ninfo@coursegate.co.uk"
    },
    client: {
      clientName: "Alison",
      clientAddress: "Level One Building, Galway Technology Park, Parkmore,\nGalway, Ireland"
    }
  }
});
