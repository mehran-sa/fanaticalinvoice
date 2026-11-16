/**
 * Thames College Alison. Matched to "Invoice 2575 (1).docx" (Learning Station
 * Ltd, trading as Thames College, to Alison, # 2575, US Letter, Arial).
 *
 * Crest top left, "INVOICE" and the number top right, the date and a grey
 * Balance Due bar right-aligned; the brand and business details; Bill To; a
 * dark rounded Item / Quantity / Rate / Amount header; Total; bank details.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, darkItemsTable, labelledLines, FONTS, LETTER } from "./kit.js";

const MUTED = "#777777";
const TEXT = "#333333";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "MMM D, YYYY");
  const right = (x0, x1, y, html, css) => el(x0, y, html, { w: x1 - x0, css: "text-align:right;white-space:nowrap;" + css });

  const companyBlock = `<div style="font-size:10pt;line-height:12pt;color:${TEXT}">` +
    `<div style="font-weight:700">Brand Name: ${or(company.name, "Your brand")}</div>` +
    [...company.address, ...(company.phone ? [company.phone] : []), ...(company.email ? [company.email] : [])].map(l => `<div>${esc(l)}</div>`).join("") + `</div>`;

  const clientBlock = `<div style="font-size:10pt;line-height:11.2pt">` +
    `<div style="color:${MUTED}">Bill To:</div>` +
    `<div style="margin-top:4.6pt;font-weight:700;color:${TEXT}">${or(client.name, "Client")}</div>` +
    [...client.address, ...(client.email ? [client.email] : [])].map(l => `<div style="margin-top:0.8pt;color:${TEXT}">${esc(l)}</div>`).join("") + `</div>`;

  const table = darkItemsTable(ctx, {
    width: 553.6, headerHeight: 21, color: "#3A3A3A", fontSize: 10, lineHeight: 11.2, headerPadTop: 3.7,
    firstRowGap: 8.2, rowPitch: 16.9, textColor: TEXT, descBold: true,
    cols: [
      { label: "Item", x: 15, w: 328.6, value: i => i.description },
      { label: "Quantity", x: 343.6, w: 75.6, value: i => i.quantityText },
      { label: "Rate", x: 419.2, w: 44.7, align: "right", value: i => money(i.rate) },
      { label: "Amount", x: 463.9, w: 74.4, align: "right", value: i => money(i.amount) }
    ],
    totalsGap: 64.5 - 16.9,
    totals: [
      ...(adjustmentRows(ctx).length ? [["Subtotal:", totals.subtotal], ...adjustmentRows(ctx).map(([l, v]) => [l + ":", v])] : []),
      ["Total:", totals.total]
    ],
    totalLabelRight: 432.6, totalLabelColor: MUTED
  });

  return renderPage([
    { y: 14.2, items: [
      el(36.8, 14.2, logoImg(ctx, "width:111pt;height:112.5pt")),
      el(461.2, 22.7, "INVOICE", { css: "font-size:28pt;line-height:31.3pt;color:#3A3A3A" }),
      right(380, 572.5, 56.6, "# " + esc(invoice.number), `font-size:12pt;line-height:13.4pt;color:${MUTED}`),
      right(300, 462.4, 108.7, "Date:", `font-size:10pt;line-height:11.2pt;color:${MUTED}`),
      right(465.4, 566.9, 108.7, esc(date(invoice.date)), `font-size:10pt;line-height:11.2pt;color:${TEXT}`),
      el(317.2, 126.8, "", { w: 269.2, css: "height:25.5pt;background:#F5F5F5;border-radius:2pt" }),
      right(300, 462.7, 131.8, "Balance Due:", `font-size:11pt;line-height:12.3pt;font-weight:700;color:${TEXT}`),
      right(465.7, 567.4, 131.8, esc(money(totals.total)), `font-size:11pt;line-height:12.3pt;font-weight:700;color:${TEXT}`),
      el(48, 140.9, companyBlock, { w: 330 })
    ] },
    { y: 215.9, items: [el(48, 215.9, clientBlock, { w: 400 })] },
    { y: 302.2, items: [el(29.2, 302.2, table)] },
    { y: 467.9, items: [el(48, 467.9, labelledLines(ctx.payment, { size: 10, lineHeight: 11.2, pitch: 13.5, labelGap: 16.5, labelColor: MUTED, color: TEXT }), { w: 540 })] }
  ], { ...LETTER, font: FONTS.arial });
}

export default alisonTemplate({
  id: "alison-thames",
  name: "Thames College",
  description: "Thames College (Learning Station Ltd) invoice to Alison: crest logo, grey Balance Due bar, dark rounded Item / Quantity / Rate / Amount header, bank details.",
  paper: LETTER.paper,
  fontStack: "Arial",
  layout,
  brand: {
    logo: "thames",
    fields: {
      companyName: "Thames College",
      companyAddress: "Business Name: Learning Station Ltd\n78 ILFORD LANE, ILFORD,\nEngland IG1 2LA\nUnited Kingdom",
      currency: "EUR",
      paymentDetails: [
        "Bank Details:",
        "Bank Name: WISE",
        "Bank Address: 56 Shoreditch High Street, London, E1 6JJ United Kingdom.",
        "Account Full Name: Learning Station Ltd",
        "IBAN: GB26 TRWI 2314 7013 2585 66",
        "Account No: 13258566",
        "Swift/BIC Code: TRWIGB2L"
      ].join("\n")
    },
    client: {
      clientName: "Alison",
      clientAddress: "Level One Building, Galway Technology Park,\nParkmore, Galway, Ireland"
    }
  }
});
