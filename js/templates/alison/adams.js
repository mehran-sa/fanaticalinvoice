/**
 * Adams Academy Alison. Matched to "Adams Academy Invoice to Alison Q2
 * 2026.docx" (A4, Arial; the Word page is drawn at twice A4 size, so every
 * measurement here is half the Word value).
 *
 * "Invoice" large and bold top right over a black rule, the company on the
 * right below it, Bill To on the left, a black-headed bordered table with the
 * description and amount centred, then Balance Due, invoice number and dates
 * right-aligned, and Payment Details.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, FONTS, A4 } from "./kit.js";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "Do MMM YYYY");

  const companyBlock =
    `<div style="font-size:15pt;line-height:16.75pt;font-weight:700">${or(company.name, "Your company")}</div>` +
    `<div style="margin-top:8.9pt;font-size:10pt;line-height:13.9pt">` +
      [...company.address, ...(company.email ? ["E: " + company.email] : []), ...(company.phone ? ["T: " + company.phone] : [])]
        .map(esc).join("<br>") + `</div>`;

  const clientLines = [
    ...client.address.map((l, i) => (i === 0 ? "Address: " : "") + l),
    ...(client.email ? ["Email: " + client.email] : [])
  ];
  const clientBlock =
    `<div style="font-size:12pt;line-height:13.4pt;font-weight:700">Bill To</div>` +
    `<div style="margin-top:3.5pt;font-size:10pt;line-height:13.9pt">${or(client.name, "Client")}` +
      (clientLines.length ? "<br>" + clientLines.map(esc).join("<br>") : "") + `</div>`;

  const B = "1.45pt solid #000";
  const rows = ctx.items.map(item =>
    `<tr style="height:47.2pt">` +
      `<td class="c" style="border:${B};vertical-align:middle;padding:0 6pt">${esc(item.description)}</td>` +
      `<td class="c" style="border:${B};vertical-align:middle;padding:0 6pt;white-space:nowrap">${esc(money(item.amount))}</td>` +
    `</tr>`).join("");
  const table =
    `<table style="width:540pt;font-size:10pt;line-height:11.15pt;border:${B}">` +
      `<colgroup><col style="width:357.5pt"><col style="width:182.5pt"></colgroup>` +
      `<tr style="height:45.55pt;background:#000;color:#fff"><td colspan="2" class="c b" style="vertical-align:middle;padding-bottom:0.3pt">Description</td></tr>` +
      rows + `</table>`;

  // Balance Due, invoice number and dates: labels right-aligned to one edge,
  // values to another.
  const metaRow = (label, value, { bold = true, big = false, gap = 0, labelPad = 0 } = {}) =>
    `<tr><td class="r b" style="width:${455.6 - 280}pt;padding:${gap}pt ${labelPad}pt 2.7pt 0">${esc(label)}</td>` +
    `<td class="r" style="width:${561.5 - 455.6}pt;padding:${gap}pt 0 2.7pt 0;white-space:nowrap;${bold ? "font-weight:700;" : ""}${big ? "font-size:11pt;line-height:11.15pt;position:relative;top:0.7pt" : ""}">${esc(value)}</td></tr>`;
  const extra = adjustmentRows(ctx);
  const meta =
    `<table style="font-size:10pt;line-height:11.15pt">` +
      (extra.length ? metaRow("Subtotal", money(totals.subtotal), { bold: false }) + extra.map(([l, v]) => metaRow(l, money(v), { bold: false })).join("") : "") +
      metaRow("Balance Due", money(totals.total), { big: true, labelPad: 3 }) +
      metaRow("Invoice no.", invoice.number, { bold: false, gap: 9.85 }) +
      metaRow("Date", date(invoice.date), { bold: false }) +
      metaRow("Due Date", date(invoice.due), { bold: false }) +
    `</table>`;

  const payment = ctx.payment.length
    ? `<div style="font-size:13pt;line-height:14.5pt;font-weight:700">Payment Details</div>` +
      `<div style="margin-top:4.15pt;font-size:12pt;line-height:13.4pt;font-weight:700;white-space:pre-wrap;margin-left:-0.7pt">${ctx.payment.map(esc).join("\n")}</div>`
    : "";

  return renderPage([
    { y: 50.65, items: [
      el(0, 50.65, "Invoice", { w: 557.95, css: "font-size:24.75pt;line-height:27.65pt;font-weight:700;text-align:right" }),
      el(18.65, 81.3, "", { w: 539.25, css: "height:1.5pt;background:#000" }),
      el(200, 91.15, companyBlock, { w: 357.95, css: "text-align:right" })
    ] },
    { y: 203.5, items: [el(19.35, 203.5, clientBlock, { w: 520 })] },
    { y: 314.1, items: [el(19.35, 314.1, table)] },
    { y: 454.55, items: [el(280, 454.55, meta)] },
    { y: 567.15, items: [el(19.35, 567.15, payment, { w: 540 })] }
  ], { ...A4, font: FONTS.arial });
}

export default alisonTemplate({
  id: "alison-adams",
  name: "Adams Academy",
  description: "Adams Academy invoice to Alison: large \"Invoice\" over a black rule, black-headed table, Balance Due and dates right-aligned, PayPal details.",
  paper: A4.paper,
  fontStack: "Arial",
  layout,
  // The academy's company, bank and PayPal details are kept encrypted in
  // js/secure/vault.js and filled in after the master password is entered.
  brand: {}
});
