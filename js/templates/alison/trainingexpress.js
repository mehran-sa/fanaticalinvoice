/**
 * Training Express Alison. Matched to "Invoice Alison - 2Q08S2026.docx"
 * (Training Express to Alison, INVOICE # 2Q08S2026, A4, Verdana and Lucida
 * Sans Unicode). In the Word file the logo and table lines are one page-sized
 * picture; here they are drawn as on it.
 *
 * Logo top left, "INVOICE", the number and dates top right; the company and
 * BILL TO; a DESCRIPTION / QUANTITY / UNIT PRICE / AMOUNT grid with a light
 * blue header (lines mentioning "due", such as "Due Amount", in red); a TOTAL
 * PAYMENT DUE box; NOTES with the bank details and PayPal.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, FONTS, A4 } from "./kit.js";

const LINE = "0.72pt solid #000";
const HEAD = "0.96pt solid #000";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "DD/MM/YYYY");
  const lucida = `font-family:${FONTS.lucida}`;

  const companyBlock =
    `<div style="font-size:11.5pt;line-height:14pt">${or(company.name, "Your company")}</div>` +
    `<div style="margin-top:0.6pt;font-size:10.5pt;line-height:12pt">` +
      [...company.address, ...(company.phone ? [company.phone] : []), ...(company.email ? [company.email] : [])].map(esc).join("<br>") + `</div>`;

  const clientBlock = `<div style="font-size:10.5pt;line-height:12.8pt">BILL TO:</div>` +
    `<div style="margin-top:2.2pt;font-size:10.5pt;line-height:12.8pt">${or(client.name, "Client")}</div>` +
    `<div style="font-size:10.5pt;line-height:13.1pt">${[...client.address, ...(client.email ? [client.email] : [])].map(esc).join("<br>")}</div>`;

  // The grid: column edges at 51.9, 332.4, 393.4, 459.1 and 543.9pt.
  const widths = [280.5, 61, 65.7, 84.8];
  const colgroup = `<colgroup>${widths.map(w => `<col style="width:${w}pt">`).join("")}</colgroup>`;
  const head = ["DESCRIPTION", "QUANTITY", "UNIT PRICE", "AMOUNT"].map((label, i) =>
    `<td style="border:${i === 0 || i === 3 ? HEAD : LINE};${i ? "text-align:center;" : "padding-left:84.2pt;"}padding-top:3.3pt">${label}</td>`).join("");
  const rows = ctx.items.map(item => {
    const red = /\bdue\b/i.test(item.description);
    return `<tr style="height:17.5pt;${lucida};font-size:8.5pt;line-height:13.1pt">` +
      `<td style="border:${LINE};border-left:${HEAD};padding:0.5pt 0 0 32pt;${red ? `font-family:${FONTS.arialBlack};font-size:8pt;line-height:12pt;color:#FF3131;padding-top:1.9pt;` : ""}">${esc(item.description)}</td>` +
      `<td class="c" style="border:${LINE};padding-top:0.5pt">${esc(item.quantityText)}</td>` +
      `<td class="c" style="border:${LINE};padding-top:0.5pt;white-space:nowrap">${esc(money(item.rate))}</td>` +
      `<td class="c" style="border:${LINE};border-right:${HEAD};padding-top:0.5pt;white-space:nowrap">${esc(money(item.amount))}</td></tr>`;
  }).join("");
  const grid = `<table style="width:492pt;font-size:8.5pt;line-height:10.3pt">${colgroup}` +
    `<tr style="height:20pt;background:#D9ECF2">${head}</tr>${rows}` +
    `<tr style="height:0"><td colspan="4" style="border-top:${HEAD}"></td></tr></table>`;

  // TOTAL PAYMENT DUE, then the box's further rows (blank on the original;
  // discount, tax or shipping go there when used).
  const extra = adjustmentRows(ctx);
  const boxRows = [["TOTAL PAYMENT DUE", totals.total], ...extra.map(([l, v]) => [l.toUpperCase(), v])];
  while (boxRows.length < 4) boxRows.push(["", null]);
  const box = `<table style="width:232.8pt;font-size:8.5pt;line-height:10.3pt"><colgroup><col style="width:148.8pt"><col style="width:84pt"></colgroup>` +
    boxRows.map(([label, value]) => `<tr style="height:18.6pt">` +
      `<td class="c" style="border:${LINE};padding-top:${label ? 2.6 : 0}pt">${esc(label)}</td>` +
      `<td class="c" style="border:${LINE};padding-top:2.3pt;${lucida};line-height:13.1pt;white-space:nowrap">${value === null ? "" : esc(money(value))}</td></tr>`).join("") + `</table>`;

  // NOTES: the payment details, then any notes.
  const notesLines = [...ctx.payment, ...(ctx.notes.length ? ["", ...ctx.notes] : [])];
  const notes = notesLines.map((line, i) => line
    ? `<div style="line-height:13.4pt;${i ? "margin-top:0.2pt" : ""}">${i === 0 ? "NOTES: " : ""}${esc(line)}</div>`
    : `<div style="height:8.5pt"></div>`).join("");

  return renderPage([
    { y: 84.6, items: [
      el(448.1, 84.6, "INVOICE", { css: "font-size:19.5pt;line-height:23.7pt;color:#575757" }),
      el(58.2, 90, logoImg(ctx, "width:177.1pt;height:61.4pt")),
      el(449, 109, "INVOICE # " + esc(invoice.number), { css: `${lucida};font-size:8.5pt;line-height:13.1pt;white-space:nowrap` }),
      el(300, 142, "DATE: " + esc(date(invoice.date)), { w: 236.4, css: `${lucida};font-size:8pt;line-height:12.3pt;text-align:right` }),
      el(300, 152.1, "DUE DATE: " + esc(date(invoice.due)), { w: 236.4, css: `${lucida};font-size:8.5pt;line-height:13.1pt;text-align:right` }),
      el(58.1, 182.7, companyBlock, { w: 380 })
    ] },
    { y: 274.1, items: [el(58.1, 274.1, clientBlock, { w: 380 })] },
    { y: 392.1, items: [el(51.9, 392.1, grid)] },
    { y: 468.9, items: [el(308.4, 468.9, box)] },
    { y: 588.8, items: [el(54.5, 588.8, `<div style="font-size:11pt">${notes}</div>`, { w: 520 })] }
  ], { ...A4, font: FONTS.verdana });
}

export default alisonTemplate({
  id: "alison-trainingexpress",
  name: "Training Express",
  description: "Training Express invoice to Alison: light blue grid header, red \"due\" lines, TOTAL PAYMENT DUE box, bank details and PayPal under NOTES.",
  paper: A4.paper,
  fontStack: "Verdana + Lucida Sans Unicode",
  layout,
  // The academy's company, bank and PayPal details are kept encrypted in
  // js/secure/vault.js and filled in after the master password is entered.
  brand: { logo: "trainingexpress" }
});
