/**
 * Study Booth Alison. Matched to "Alison Invoice - 2213.docx" (Study Booth to
 * Alison, # ID: 2213, US Letter, Times New Roman with Arial amounts).
 *
 * Logo and company top left, "INVOICE" and "# ID:" top right; the dates on a
 * light grey panel; Bill To with the e-mail as a blue link; Total Due and
 * Current Due amounts; a black-headed Description / Amount table; then
 * Notes and the bank details.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, textLines, FONTS, LETTER } from "./kit.js";

const GREY = "#767676";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "DD MMM YYYY");

  const companyBlock =
    `<div style="font-size:9.5pt;line-height:11.1pt;font-weight:700;color:#333;text-transform:uppercase">${or(company.name, "Your company")}</div>` +
    `<div style="font-size:10pt;color:#333">${textLines([...company.address, ...(company.phone ? [company.phone] : []), ...(company.email ? [company.email] : [])], { pitch: 11.6 })}</div>`;

  const clientBlock =
    `<div style="font-size:8.5pt;line-height:13.5pt;color:${GREY}">Bill To:</div>` +
    `<div style="font-size:11pt;line-height:19.4pt;font-weight:700;color:#333">${or(client.name, "Client")}</div>` +
    `<div style="font-size:10pt;margin-left:-2pt">${textLines(client.address, { pitch: 11.5 })}</div>` +
    (client.email ? `<div style="margin-top:4pt;font-size:10.5pt;line-height:13.8pt;color:#0000FF;text-decoration:underline">${esc(client.email)}</div>` : "");

  const extra = adjustmentRows(ctx);
  const due = (label, value, labelCss, valueCss) =>
    `<tr><td style="white-space:nowrap;${labelCss}">${esc(label)}</td><td style="white-space:nowrap;${valueCss}">${esc(value)}</td></tr>`;
  const dueBlock = `<table style="width:219pt"><colgroup><col style="width:123pt"><col style="width:96pt"></colgroup>` +
    extra.map(([l, v]) => due(l + ":", money(v), "font-family:" + FONTS.arial + ";font-size:10pt;line-height:13pt;font-weight:700", "font-family:" + FONTS.arial + ";font-size:10pt;font-weight:700")).join("") +
    due("Total Due Amount:", money(totals.total), "font-size:11.5pt;line-height:13pt;font-weight:700;color:#333", "font-family:" + FONTS.arial + ";font-size:10.5pt;line-height:13pt;font-weight:700;color:#333;padding-top:0.7pt") +
    due("Current Due Amount:", money(totals.total), "font-family:" + FONTS.arial + ";font-size:10pt;line-height:11.2pt;font-weight:700", "font-family:" + FONTS.arial + ";font-size:10pt;line-height:11.2pt;font-weight:700") +
    `</table>`;

  const B = "0.5pt solid #000";
  const rows = ctx.items.map(item =>
    `<tr style="height:21.2pt">` +
      `<td style="border:${B};padding:0.7pt 0 0 2.6pt;font-size:11pt;line-height:12.2pt;font-weight:700">${esc(item.description)}</td>` +
      `<td class="c" style="border:${B};padding-top:0.5pt;font-family:${FONTS.arial};font-size:11pt;line-height:12.3pt;font-weight:700;color:#333;white-space:nowrap">${esc(money(item.amount))}</td>` +
    `</tr>`).join("");
  const table =
    `<table style="width:537.3pt"><colgroup><col style="width:445.2pt"><col style="width:92.1pt"></colgroup>` +
      `<tr style="height:27pt;background:#000;color:#fff;font-weight:700">` +
        `<td class="c" style="padding-top:5.9pt;font-size:12.5pt;line-height:13.8pt;border-right:0.5pt solid #fff">Description</td>` +
        `<td class="c" style="padding-top:6.3pt;font-size:12pt;line-height:13.3pt">Amount</td></tr>` +
      rows + `</table>`;

  const notes =
    `<div style="font-size:9.5pt;line-height:13.3pt;margin-bottom:11.6pt;color:${GREY}">Notes:</div>` +
    `<div style="font-size:10pt">${textLines([...ctx.notes, ...(ctx.notes.length && ctx.payment.length ? [""] : []), ...ctx.payment], { pitch: 11.5 })}</div>`;

  return renderPage([
    { y: 17.1, items: [
      el(427, 17.1, "INVOICE", { css: "font-size:36pt;line-height:39.9pt;color:#393939" }),
      el(37, 24.9, logoImg(ctx, "width:143.2pt;height:33.1pt")),
      el(513.1, 57.6, "# ID: " + esc(invoice.number), { css: `font-size:12pt;line-height:13.3pt;font-weight:700;color:${GREY};white-space:nowrap` }),
      el(37, 61.6, companyBlock, { w: 300 })
    ] },
    { y: 129, items: [
      el(331.2, 129, "", { w: 270.8, css: "height:42.7pt;background:#F4F4F4;border-radius:3pt" }),
      el(414.1, 144, "Date:", { css: `font-size:10pt;line-height:11.1pt;font-weight:700;color:${GREY}` }),
      el(488.3, 143.9, esc(date(invoice.date)), { css: "font-size:11.5pt;line-height:12.7pt;font-weight:700;white-space:nowrap" }),
      el(414.1, 170.3, "Due Date:", { css: `font-size:10pt;line-height:11.1pt;font-weight:700;color:${GREY}` }),
      el(488, 168.9, esc(date(invoice.due)), { css: "font-size:11.5pt;line-height:12.7pt;font-weight:700;white-space:nowrap" }),
      el(46, 157.3, clientBlock, { w: 330 }),
      el(389, 192.5, dueBlock, { w: 219 })
    ] },
    { y: 321.9, items: [el(36.7, 321.9, table)] },
    { y: 431, items: [el(48.6, 431, notes, { w: 540 })] }
  ], { ...LETTER, font: FONTS.times });
}

export default alisonTemplate({
  id: "alison-studybooth",
  name: "Study Booth",
  description: "Study Booth invoice to Alison: dates on a grey panel, Total Due and Current Due amounts, black-headed table, Notes with bank details.",
  paper: LETTER.paper,
  fontStack: "Times New Roman + Arial",
  layout,
  brand: {
    logo: "studybooth",
    fields: {
      companyName: "STUDY BOOTH",
      companyAddress: "75 Honey Close\nDagenham, England\nRM10 8TF, United Kingdom",
      currency: "EUR",
      paymentDetails: [
        "Bank Details", "",
        "Bank name: Lloyds Bank",
        "Name on account: Edujanets Ltd",
        "Country: United Kingdom",
        "Account number: 60046160",
        "Swift Code (BIC): LOYDGB21031",
        "IBAN: GB60LOYD30989760046160",
        "Bank Address: Chelmsford Legg St Osc, 1 Legg Street, Chelmsford, Essex, CM"
      ].join("\n")
    },
    client: {
      clientName: "Alison",
      clientAddress: "Mount Carmel\nLoughrea\nCo. Galway\nH62 AV62\nIreland",
      clientEmail: "mmoggan@alison.com"
    }
  }
});
