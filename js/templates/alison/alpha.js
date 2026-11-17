/**
 * Alpha Academy Alison. Matched to "A20260810013.docx" (Adams Academy Inc.
 * Ltd, trading as Alpha Academy, to Alison, # A20260810013, US Letter, Arial).
 *
 * Logo top left, "INVOICE" and the number top right; the company with its VAT
 * and company registration numbers, address, phone and e-mail; the date and a
 * grey Balance Due bar on the right; "To:" Alison; a bordered Name / Total
 * table; a large "Total"; the bank details and PayPal under "Invoice Note:".
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, FONTS, LETTER } from "./kit.js";

const MUTED = "#777777";
const TEXT = "#333333";
const LINE = "0.5pt solid #000";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "MMM D, YYYY");
  const line = (text, gap) => `<div style="margin-top:${gap}pt">${esc(text)}</div>`;

  const companyBlock = `<div style="font-size:10pt;line-height:11.2pt;color:${TEXT}">` +
    `<div style="font-weight:700">${or(company.name, "Your company")}</div>` +
    (company.vat ? line("VAT Reg Number: " + company.vat, 2.5) : "") +
    (company.reg ? line("Company Reg Number: " + company.reg, 1.7) : "") +
    company.address.map((l, i) => line(l, i ? 0 : 2)).join("") +
    (company.phone ? line("Phone: " + company.phone, 0) : "") +
    (company.email ? line("Email: " + company.email, 1.8) : "") + `</div>`;

  const clientBlock = `<div style="font-size:10pt;line-height:11.2pt">` +
    `<div style="color:${MUTED}">To:</div>` +
    `<div style="margin-top:0.3pt;font-weight:700">${or(client.name, "Client")}</div>` +
    [...client.address, ...(client.email ? [client.email] : [])].map(l => `<div style="margin-top:2.1pt">${esc(l)}</div>`).join("") + `</div>`;

  const table = `<table style="width:539.3pt;font-size:10pt;line-height:11.2pt"><colgroup><col style="width:349.7pt"><col style="width:189.6pt"></colgroup>` +
    `<tr style="height:23.6pt;font-weight:700"><td style="border:${LINE};padding:6.4pt 0 0 8pt">Name</td><td style="border:${LINE};padding:6.4pt 0 0 8.3pt">Total</td></tr>` +
    ctx.items.map(item => `<tr style="height:18pt"><td style="border:${LINE};padding:4.6pt 0 0 8pt">${esc(item.description)}</td>` +
      `<td style="border:${LINE};padding:4.5pt 0 0 11.1pt;font-family:${FONTS.msSans};white-space:nowrap">${esc(money(item.amount))}</td></tr>`).join("") + `</table>`;

  const extra = adjustmentRows(ctx);
  const totalLine = (label, value) => `<div style="white-space:nowrap"><span style="color:${MUTED}">${esc(label)}</span> <span style="color:${TEXT}">${esc(money(value))}</span></div>`;
  const total = `<div style="font-size:14.5pt;line-height:16.2pt;font-weight:700">` +
    (extra.length ? totalLine("Subtotal", totals.subtotal) + extra.map(([l, v]) => totalLine(l, v)).join("") : "") +
    totalLine("Total", totals.total) + `</div>`;

  const note = `<div style="font-size:11.5pt;line-height:12.8pt">` +
    `<div style="color:#808080">Invoice Note:</div>` +
    [...ctx.notes, ...(ctx.notes.length && ctx.payment.length ? [""] : []), ...ctx.payment]
      .map(l => `<div style="margin-top:0.6pt">${l ? esc(l) : "&nbsp;"}</div>`).join("") + `</div>`;

  return renderPage([
    { y: 70.8, items: [
      el(51.7, 70.8, logoImg(ctx, "width:167pt;height:58.2pt")),
      el(461.3, 75.8, "INVOICE", { css: "font-size:27.5pt;line-height:30.7pt;color:#393939" }),
      el(484.3, 113.7, "# " + esc(invoice.number), { css: `font-size:12pt;line-height:13.4pt;color:${MUTED};white-space:nowrap` }),
      el(49.8, 140.8, companyBlock, { w: 270 }),
      el(447.9, 168.3, "Date:", { css: `font-size:12pt;line-height:13.4pt;color:${MUTED}` }),
      el(498.8, 168.3, esc(date(invoice.date)), { css: `font-size:12pt;line-height:13.4pt;color:${TEXT};white-space:nowrap` }),
      el(321.9, 201.8, "", { w: 270.2, css: "height:26.1pt;background:#F5F5F5;border-radius:2pt" }),
      el(394, 203.7, "Balance Due:", { css: `font-size:14.5pt;line-height:16.2pt;font-weight:700;color:${TEXT};white-space:nowrap` }),
      el(501.6, 203.7, esc(money(totals.total)), { css: `font-size:14.5pt;line-height:16.2pt;font-weight:700;color:${TEXT};white-space:nowrap` })
    ] },
    { y: 241.3, items: [el(49.8, 241.3, clientBlock, { w: 360 })] },
    { y: 362.4, items: [el(50.8, 362.4, table)] },
    { y: 448, items: [el(398.6, 448, total)] },
    { y: 527.1, items: [el(45.6, 527.1, note, { w: 540 })] }
  ], { ...LETTER, font: FONTS.arial });
}

export default alisonTemplate({
  id: "alison-alpha",
  name: "Alpha Academy",
  description: "Alpha Academy (Adams Academy Inc. Ltd) invoice to Alison: VAT and company numbers, grey Balance Due bar, bordered Name / Total table, bank details under Invoice Note.",
  paper: LETTER.paper,
  fontStack: "Arial (Microsoft Sans Serif amounts)",
  layout,
  // The academy's company, bank and PayPal details are kept encrypted in
  // js/secure/vault.js and filled in after the master password is entered.
  brand: { logo: "alpha" }
});
