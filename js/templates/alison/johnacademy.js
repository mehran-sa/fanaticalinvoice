/**
 * John Academy Alison. Matched to "Q2 2026 Invoice for Alison from John
 * Academy.docx" (John Academy to Alison, # 2026081102, US Letter, Times New
 * Roman).
 *
 * The company top left with its e-mail as a link; "INVOICE" and the number
 * top right; the dates; Bill To; a grey Balance Due bar; a black-headed
 * Description / Amount table ending in "Total remaining payable amount";
 * Notes with the bank details.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, FONTS, LETTER } from "./kit.js";

const MUTED = "#767676";
const TEXT = "#333333";
const LINK = "color:#0460C1;text-decoration:underline";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "DD MMM YYYY");

  const companyBlock = `<div style="font-size:10pt;line-height:11.55pt;color:${TEXT}">` +
    `<div style="font-weight:700;line-height:11.7pt">${or(company.name, "Your company")}</div>` +
    [...company.address, ...(company.phone ? [company.phone] : [])].map(l => `<div>${esc(l)}</div>`).join("") +
    (company.email ? `<div style="${LINK}">${esc(company.email)}</div>` : "") + `</div>`;

  const clientBlock = `<div style="font-size:9pt;line-height:16pt;color:${MUTED}">Bill To:</div>` +
    `<div style="font-size:10pt;line-height:16pt;font-weight:700;color:${TEXT}">${or(client.name, "Client")}</div>` +
    `<div style="font-size:10pt;line-height:11.55pt;margin-left:-2pt">${client.address.map(esc).join("<br>")}</div>` +
    (client.email ? `<div style="margin-top:4.4pt;font-size:10pt;line-height:11.5pt;${LINK}">${esc(client.email)}</div>` : "");

  const B = "0.5pt solid #000";
  const extra = adjustmentRows(ctx);
  const row = (label, value, bold) => `<tr style="height:21.4pt;${bold ? "font-weight:700;" : ""}"><td style="border:${B};padding-left:3.3pt">${esc(label)}</td>` +
    `<td class="c" style="border:${B};color:${TEXT};white-space:nowrap">${esc(money(value))}</td></tr>`;
  const table = `<table style="width:537.6pt;font-size:11pt;line-height:12.2pt"><colgroup><col style="width:445.6pt"><col style="width:92pt"></colgroup>` +
    `<tr style="height:27.1pt;background:#000;color:#fff;font-weight:700"><td class="c" style="padding-top:4.1pt;font-size:12.5pt;line-height:13.8pt;border-right:0.5pt solid #fff">Description</td><td class="c" style="padding-top:4.5pt;font-size:12pt;line-height:13.3pt">Amount</td></tr>` +
    ctx.items.map(item => row(item.description, item.amount, false)).join("") +
    (extra.length ? row("Subtotal", totals.subtotal) + extra.map(([l, v]) => row(l, v)).join("") : "") +
    row("Total remaining payable amount", totals.total, true) + `</table>`;

  const notes = `<div style="font-size:10pt;line-height:17pt;color:${MUTED}">Notes:</div>` +
    `<div style="font-size:10pt">` + [...ctx.notes, ...(ctx.notes.length && ctx.payment.length ? [""] : []), ...ctx.payment]
      .map(l => (l ? `<div style="line-height:11.5pt">${esc(l)}</div>` : `<div style="height:11.5pt"></div>`)).join("") + `</div>`;

  return renderPage([
    { y: 23.1, items: [
      el(427.1, 23.1, "INVOICE", { w: 180.9, css: "font-size:28.5pt;line-height:31.6pt;color:#393939;text-align:center" }),
      el(48.7, 24.9, companyBlock, { w: 360 }),
      el(493.5, 57.4, "# " + esc(invoice.number), { css: `font-size:12.5pt;line-height:13.8pt;color:${MUTED};white-space:nowrap` })
    ] },
    { y: 108, items: [
      el(414.9, 108.1, "Date:", { css: `font-size:10pt;line-height:11.1pt;color:${MUTED}` }),
      el(488.7, 108, esc(date(invoice.date)), { css: "font-size:11.5pt;line-height:12.7pt;white-space:nowrap" }),
      el(414.9, 131.4, "Due Date:", { css: `font-size:10pt;line-height:11.1pt;color:${MUTED}` }),
      el(488.7, 133.1, esc(date(invoice.due)), { css: "font-size:11.5pt;line-height:12.7pt;white-space:nowrap" }),
      el(46, 121.9, clientBlock, { w: 330 }),
      el(332.2, 150, "", { w: 268.8, css: "height:24.6pt;background:#F4F4F4;border-radius:2pt" }),
      el(254.5, 155.4, "Balance Due:", { w: 200, css: `font-size:11.5pt;line-height:12.7pt;font-weight:700;color:${TEXT};text-align:right` }),
      el(511.8, 157.8, esc(money(totals.total, { space: true })), { css: `font-size:11.5pt;line-height:12.7pt;font-weight:700;color:${TEXT};white-space:nowrap` })
    ] },
    { y: 285.1, items: [el(37.7, 285.1, table)] },
    { y: 416.1, items: [el(48.7, 416.1, notes, { w: 540 })] }
  ], { ...LETTER, font: FONTS.times });
}

export default alisonTemplate({
  id: "alison-johnacademy",
  name: "John Academy",
  description: "John Academy invoice to Alison: grey Balance Due bar, black-headed table ending in \"Total remaining payable amount\", Notes with bank details.",
  paper: LETTER.paper,
  fontStack: "Times New Roman",
  layout,
  // The academy's company, bank and PayPal details are kept encrypted in
  // js/secure/vault.js and filled in after the master password is entered.
  brand: {}
});
