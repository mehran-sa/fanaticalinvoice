/**
 * One Education Alison. Matched to "Invoice_07082026Q2.docx" (One Education
 * to Alison, # 07082026Q2, US Letter, Arial).
 *
 * Logo top left, "INVOICE" and the number top right; the company with a wide
 * grey Balance Due bar beside it; Bill To with the dates; a dark rounded
 * Item / Quantity / Rate / Amount header with tight rows; Total; "Note: Total
 * due is" with the amount in red; PayPal and bank details.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, darkItemsTable, labelledLines, FONTS, LETTER } from "./kit.js";

const MUTED = "#777777";
const TEXT = "#333333";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "MMM DD, YYYY");
  const right = (x0, x1, y, html, css) => el(x0, y, html, { w: x1 - x0, css: "text-align:right;white-space:nowrap;" + css });

  const companyBlock = `<div style="font-size:10pt;line-height:11.2pt;color:${TEXT}">` +
    `<div style="font-weight:700">${or(company.name, "Your company")}</div>` +
    company.address.map(l => `<div style="margin-top:1.4pt">${esc(l)}</div>`).join("") +
    [company.phone, company.email].filter(Boolean).map(l => `<div style="margin-top:2.1pt;color:#000">${esc(l)}</div>`).join("") + `</div>`;

  const clientBlock = `<div style="font-size:10pt;line-height:11.2pt">` +
    `<div style="color:${MUTED}">Bill To:</div>` +
    `<div style="margin-top:5.6pt;font-weight:700;color:${TEXT}">${or(client.name, "Client")}</div>` +
    [...client.address, ...(client.email ? [client.email] : [])].map(l => `<div style="margin-top:0.4pt;color:${TEXT}">${esc(l)}</div>`).join("") + `</div>`;

  const extra = adjustmentRows(ctx);
  const table = darkItemsTable(ctx, {
    width: 553.6, headerHeight: 21.7, color: "#3A3A3A", fontSize: 10, lineHeight: 11.2, headerPadTop: 3.9,
    firstRowGap: 0.5, rowPitch: 11.4, textColor: TEXT, descBold: true,
    cols: [
      { label: "Item", x: 13.7, w: 323.2, value: i => i.description, headerPad: 3.8 },
      { label: "Quantity", x: 336.9, w: 71.3, value: i => i.quantityText, headerIndent: 3.2 },
      { label: "Rate", x: 408.2, w: 85.1, value: i => money(i.rate), headerIndent: 34.3 },
      { label: "Amount", x: 493.3, w: 60.3, value: i => money(i.amount), css: "color:#000", headerIndent: 13 }
    ],
    totalsGap: 330.8 - 287.3 - 2 * 11.4 + 0.0,
    totals: [...(extra.length ? [["Subtotal", totals.subtotal], ...extra] : []), ["Total", totals.total]],
    totalLabelRight: 452.6, totalLabelColor: MUTED, totalLabelCss: "position:relative;top:1.2pt",
    totalValueCss: "padding-right:15.7pt"
  });
  const tableHtml = table;

  const note = `<div style="font-size:10pt;line-height:17.9pt;color:${MUTED}"><b>Note:</b> Total due is ` +
    `<b style="font-size:16pt;color:#FF0000">${esc(money(totals.total))}</b></div>` +
    (ctx.notes.length ? `<div style="font-size:10pt;line-height:11.2pt;color:${TEXT};margin-top:4pt">${ctx.notes.map(esc).join("<br>")}</div>` : "");

  return renderPage([
    { y: 19.9, items: [
      el(464.3, 19.9, "INVOICE", { css: "font-size:28.5pt;line-height:31.8pt;color:#393939" }),
      el(37.5, 21.2, logoImg(ctx, "width:149.9pt;height:25.4pt")),
      right(380, 572.1, 55, "# " + esc(invoice.number), `font-size:12pt;line-height:13.4pt;color:${MUTED}`),
      el(48.6, 89.2, companyBlock, { w: 215 }),
      el(267.7, 127, "", { w: 329.8, css: "height:27.6pt;background:#F5F5F5;border-radius:2pt" }),
      el(353.8, 132, "Balance Due:", { css: `font-size:11.5pt;line-height:12.8pt;font-weight:700;color:${TEXT}` }),
      el(521.9, 132, esc(money(totals.total)), { css: `font-size:11.5pt;line-height:12.8pt;font-weight:700;color:${TEXT};white-space:nowrap` })
    ] },
    { y: 176.5, items: [
      right(300, 450.9, 176.5, "Date:", `font-size:10pt;line-height:11.2pt;color:${MUTED}`),
      right(470, 571.6, 176.5, esc(date(invoice.date)), `font-size:10pt;line-height:11.2pt;color:${TEXT}`),
      right(300, 450.2, 205.6, "Due Date:", `font-size:10pt;line-height:11.2pt;color:${MUTED}`),
      right(470, 571.6, 205.6, esc(date(invoice.due)), `font-size:10pt;line-height:11.2pt;color:${TEXT}`),
      el(49.9, 177.8, clientBlock, { w: 240 })
    ] },
    { y: 265.1, items: [el(32, 265.1, tableHtml)] },
    { y: 393.2, items: [el(36, 393.2, note, { w: 540 })] },
    { y: 503.4, items: [el(72, 503.4, labelledLines(ctx.payment, { size: 10, lineHeight: 11.2, pitch: 16.9, labelGap: 16.8, sectionGap: 17, labelColor: MUTED, color: TEXT }), { w: 520 })] }
  ], { ...LETTER, font: FONTS.arial });
}

export default alisonTemplate({
  id: "alison-oneeducation",
  name: "One Education",
  description: "One Education invoice to Alison: wide grey Balance Due bar, dark rounded Item / Quantity / Rate / Amount header, \"Total due\" note in red, PayPal and bank details.",
  paper: LETTER.paper,
  fontStack: "Arial",
  layout,
  brand: {
    logo: "oneeducation",
    fields: {
      companyName: "One Education",
      companyAddress: "63 St Mary Axe\nLondon, EC3A 8AA",
      companyPhone: "020 3890 6420",
      currency: "EUR",
      paymentDetails: [
        "PayPal:",
        "Email: info@oneeducation.org.uk",
        "Bank Details:",
        "Bank Name: Lloyds Bank",
        "Branch Name: Chelmsford",
        "Bank Account Name: Edukators London Ltd",
        "Sort Code: 309897",
        "Account Number: 60992068",
        "Bank Account Currency: GBP",
        "Swift code: LOYDGB21031",
        "IBAN: GB62LOYD30989760992068"
      ].join("\n")
    },
    client: {
      clientName: "Alison",
      clientAddress: "Level One Building, Galway Technology Park,\nParkmore, Galway, Ireland"
    }
  }
});
