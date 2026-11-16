/**
 * Mayfair College Alison. Matched to "Invoice for Q3 of 2026 [Alison]
 * (1).docx" (Mayfair College Ltd to Alison, INVOICE #2026-6900, US Letter,
 * Verdana, Calibri and Times New Roman).
 *
 * The oval logo top left; "INVOICE", the date, number and Balance Due top
 * right; the company (with "Reg. no:") and the client side by side in bold
 * Calibri; a black-headed Description / Amount table; "Bank Details:" as a
 * bordered table; "Thank you for your Partnership!" (the Terms field).
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, keyValueRows, FONTS, LETTER } from "./kit.js";

const CALIBRI = `font-family:${FONTS.calibri}`;
const TIMES = `font-family:${FONTS.times}`;

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "DD-MMM-YYYY");
  const side = arr => `<div style="${CALIBRI};font-size:11pt;line-height:13.3pt;font-weight:700">${arr.map(l => `<div>${l}</div>`).join("")}</div>`;

  const companyLines = [or(company.name, "Your company"), ...(company.reg ? ["Reg. no: " + esc(company.reg)] : []),
    ...company.address.map(esc), ...[company.phone, company.email].filter(Boolean).map(esc)];
  const clientLines = [or(client.name, "Client"), ...client.address.map(esc), ...(client.email ? [esc(client.email)] : [])];

  const B = "0.5pt solid #000";
  const extra = adjustmentRows(ctx);
  const table = `<table style="width:537.8pt;${TIMES};font-size:11pt;line-height:12.2pt"><colgroup><col style="width:445.8pt"><col style="width:92pt"></colgroup>` +
    `<tr style="height:27.9pt;background:#000;color:#fff;font-weight:700"><td class="c" style="padding-top:3.9pt;font-size:12.5pt;line-height:13.8pt;border-right:0.5pt solid #fff">Description</td><td class="c" style="padding-top:4.3pt;font-size:12pt;line-height:13.3pt">Amount</td></tr>` +
    ctx.items.map(item => `<tr style="height:20.4pt"><td style="border:${B};padding:0 0 0 3.2pt">${esc(item.description)}</td>` +
      `<td class="c" style="border:${B};color:#333;white-space:nowrap">${esc(money(item.amount, { space: true }))}</td></tr>`).join("") +
    (extra.length ? [["Subtotal", totals.subtotal], ...extra, ["Total", totals.total]].map(([l, v]) =>
      `<tr style="height:20.4pt"><td class="r" style="padding-right:6pt">${esc(l)}</td><td class="c" style="border:${B};color:#333;white-space:nowrap">${esc(money(v, { space: true }))}</td></tr>`).join("") : "") +
    `</table>`;

  const rows = keyValueRows(ctx.paymentText, { columns: true });
  const bank = rows.length ? `<div style="${CALIBRI};font-size:11pt;line-height:13.4pt;font-weight:700">Bank Details:</div>` +
    `<table style="margin:12.3pt 0 0 5.1pt;width:262.5pt;font-size:9.5pt;line-height:11.5pt;border:1.4pt solid #000"><colgroup><col style="width:92.4pt"><col style="width:170.1pt"></colgroup>` +
    rows.map(r => `<tr style="height:21.4pt"><td style="border:1.4pt solid #000;padding:5.2pt 0 0 10.3pt">${esc(r.key)}</td><td style="border:1.4pt solid #000;padding:5.2pt 0 0 9.5pt">${esc(r.key ? r.value : r.value)}</td></tr>`).join("") + `</table>` : "";

  const thanks = ctx.terms.length ? `<div style="${TIMES};font-size:9pt;line-height:10pt;font-weight:700;font-style:italic">${ctx.terms.map(esc).join("<br>")}</div>` : "";

  return renderPage([
    { y: 15.5, items: [
      el(16.4, 15.5, logoImg(ctx, "width:192.2pt;height:143.5pt")),
      el(442.3, 100.9, "INVOICE", { css: "font-size:20pt;line-height:24.3pt;color:#525252" }),
      el(441.1, 139, "Date: " + esc(date(invoice.date)), { css: "font-size:9.5pt;line-height:11.5pt;white-space:nowrap" }),
      el(441.1, 152.7, "INVOICE #" + esc(invoice.number), { css: "font-size:9.5pt;line-height:11.5pt;white-space:nowrap" }),
      el(434.6, 182.7, `<b style="font-size:11pt">Balance Due:</b> <b style="${TIMES};font-size:14pt;color:#333">${esc(money(totals.total))}</b>`, { css: "line-height:15.5pt;white-space:nowrap" })
    ] },
    { y: 227.7, items: [
      el(33, 227.7, side(companyLines), { w: 398 }),
      el(434.6, 227.7, side(clientLines), { w: 173.4 })
    ] },
    { y: 340.7, items: [el(33, 340.7, table)] },
    { y: 465.2, items: [el(39.2, 465.2, bank, { w: 400 })] },
    { y: 670.9, items: [el(233.9, 670.9, thanks, { w: 374 })] }
  ], { ...LETTER, font: FONTS.verdana });
}

export default alisonTemplate({
  id: "alison-mayfair",
  name: "Mayfair College",
  description: "Mayfair College invoice to Alison: oval logo, company and client side by side, black-headed Description / Amount table, boxed bank details, thank-you line.",
  paper: LETTER.paper,
  fontStack: "Verdana, Calibri and Times New Roman",
  layout,
  brand: {
    logo: "mayfair",
    fields: {
      companyName: "Mayfair College Ltd",
      companyReg: "12389626",
      companyAddress: "163 City Road, London, England,\nEC1V 1NR",
      currency: "EUR",
      paymentDetails: [
        "NatWest A/C  MAYFAIR COLLEGE LTD",
        "A /C no:  24214205",
        "Sort Code:  600537",
        "WWIFT/BIC:  NWBKGB2L",
        "IBAN  GB29NWBK60053724214205"
      ].join("\n"),
      terms: "Thank you for your Partnership!"
    },
    client: {
      clientName: "Alison",
      clientAddress: "Mount Carmel\nLoughrea, Co. Galway\nH62 AV62, Ireland",
      clientEmail: "mmoggan@alison.com"
    }
  }
});
