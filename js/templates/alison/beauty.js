/**
 * Institute of Beauty & Makeup Alison. Matched to "Alison_invoice2026-2.docx"
 * (Purple Academy Ltd, trading as the Institute of Beauty & Makeup, to Alison,
 * #48770, US Letter, Times New Roman).
 *
 * Logo top left, "INVOICE" and the number right-aligned; the company with its
 * phone and e-mail; dates on a light grey panel beside Bill To; a black-headed
 * Description table; then PayPal and bank details.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, textLines, isDetailsHeading, FONTS, LETTER } from "./kit.js";

const GREY = "#757575";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "MMMM D, YYYY");

  const companyBlock =
    `<div style="font-size:10pt;line-height:16.1pt;font-weight:700;color:#333">${or(company.name, "Your company")}</div>` +
    `<div style="font-size:10pt">${textLines([...company.address, ...(company.phone ? [company.phone] : []), ...(company.email ? [company.email] : [])], { pitch: 16.1, links: true })}</div>`;

  const clientBlock =
    `<div style="font-size:10pt;line-height:16.1pt;color:${GREY}">Bill To:</div>` +
    `<div style="font-size:10pt;line-height:16.1pt;font-weight:700;color:#333">${or(client.name, "Client")}</div>` +
    `<div style="font-size:10pt">${textLines([...client.address, ...(client.email ? [client.email] : [])], { pitch: 16.1, links: true })}</div>`;

  const B = "1pt solid #000";
  const rows = ctx.items.map(item =>
    `<tr style="height:21pt">` +
      `<td style="border:${B};border-top:0;padding:0 0 0 2.2pt;font-size:11pt;line-height:12.2pt">${esc(item.description)}</td>` +
      `<td class="c" style="border:${B};border-top:0;font-size:11pt;line-height:12.2pt;font-weight:700;color:#333;white-space:nowrap">${esc(money(item.amount))}</td>` +
    `</tr>`).join("");
  const extra = adjustmentRows(ctx);
  const sumRows = extra.length || ctx.items.length > 1
    ? [["Subtotal", totals.subtotal], ...extra, ["Total", totals.total]].map(([l, v]) =>
      `<tr style="height:21pt"><td class="r" style="padding-right:6pt;font-size:11pt;line-height:12.2pt">${esc(l)}</td>` +
      `<td class="c" style="border:${B};border-top:0;font-size:11pt;line-height:12.2pt;font-weight:700;color:#333;white-space:nowrap">${esc(money(v))}</td></tr>`).join("")
    : "";
  const table =
    `<table style="width:538.2pt"><colgroup><col style="width:445.8pt"><col style="width:92.4pt"></colgroup>` +
      `<tr style="height:29pt;background:#000;color:#fff"><td class="c" style="padding-top:5pt;font-size:12pt;line-height:13.3pt;font-weight:700">Description</td><td></td></tr>` +
      rows + sumRows + `</table>`;

  const payment = `<div style="font-size:10pt">${textLines([...ctx.notes, ...(ctx.notes.length ? [""] : []), ...ctx.payment], {
    pitch: 11.5, links: true, heading: isDetailsHeading
  })}</div>`;

  return renderPage([
    { y: 62.8, items: [
      el(0, 62.8, "INVOICE", { w: 558.7, css: "font-size:28.5pt;line-height:31.6pt;color:#383838;text-align:right" }),
      el(38.5, 65.7, logoImg(ctx, "width:241.6pt;height:90pt")),
      el(200, 99.2, "#" + esc(invoice.number), { w: 358.9, css: `font-size:12.5pt;line-height:13.8pt;color:${GREY};text-align:right` })
    ] },
    { y: 177.2, items: [el(37, 177.2, companyBlock, { w: 340, css: "position:relative;top:-2.5pt" })] },
    { y: 309.2, items: [
      el(386.9, 309.2, "", { w: 205.5, css: "height:75pt;background:#F4F4F4;border-radius:3pt" }),
      el(292.6, 323.7, "Date:", { css: `font-size:10pt;line-height:11.1pt;color:${GREY}` }),
      el(421.1, 324.6, esc(date(invoice.date)), { css: "font-size:11.5pt;line-height:12.7pt;white-space:nowrap" }),
      el(293.7, 346.8, "Due Date:", { css: `font-size:10pt;line-height:11.1pt;color:${GREY}` }),
      el(421.1, 350.9, esc(date(invoice.due)), { css: "font-size:11.5pt;line-height:12.7pt;white-space:nowrap" }),
      el(37, 343.2, clientBlock, { w: 250, css: "position:relative;top:-2.5pt" })
    ] },
    { y: 482.4, items: [el(37, 482.4, table)] },
    { y: 580.7, items: [el(37, 580.7, payment, { w: 540 })] }
  ], { ...LETTER, font: FONTS.times });
}

export default alisonTemplate({
  id: "alison-beauty",
  name: "Institute of Beauty & Makeup",
  description: "Institute of Beauty & Makeup (Purple Academy Ltd) invoice to Alison: dates on a grey panel, black-headed Description table, PayPal and bank details.",
  paper: LETTER.paper,
  fontStack: "Times New Roman",
  layout,
  // The academy's company, bank and PayPal details are kept encrypted in
  // js/secure/vault.js and filled in after the master password is entered.
  brand: { logo: "beauty" }
});
