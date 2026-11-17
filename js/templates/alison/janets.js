/**
 * Janets Alison. Matched to "Janets Invoice (1).docx" (Edujanets Ltd to
 * Alison, invoice #2026-11005, US Letter, Arial).
 *
 * Logo top left with the company below it; "INVOICE" in grey and the invoice
 * details top right; Bill To; a Description / Amount table with a shaded
 * header and grey rules, Subtotal and a shaded Total box; then the PayPal
 * address on a green bar and the bank details as a green-striped table.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, keyValueRows, adjustmentRows, logoImg, FONTS, LETTER } from "./kit.js";

const GREEN = "#9BB852";
const STRIPE = "#EAEBDD";
const RULE = "#DCDCDC";
const TABLE_RULE = "#C2D29B";
const ROW = 22.5;

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "MMM, DD, YYYY");

  // Company: name, address lines, email, stacked as on the original.
  const companyBlock =
    `<div style="font-size:15.5pt;line-height:17.3pt">${or(company.name, "Your company")}</div>` +
    `<div style="margin-top:10.8pt;font-size:9.5pt;line-height:12.6pt">` +
      (company.address.length ? company.address.map(esc).join("<br>") : or("", "Company address")) + `</div>` +
    (company.email ? `<div style="margin-top:9pt;font-size:9.5pt;line-height:10.6pt">${esc(company.email)}</div>` : "");

  const meta = [
    `Invoice: #${esc(invoice.number)}`,
    `Date: ${esc(date(invoice.date))}`,
    `Due date: ${esc(date(invoice.due))}`
  ].map((t, i) => `<div style="position:relative;top:${[0, 0.1, 0.1][i]}pt;line-height:12.65pt">${t}</div>`).join("");

  const clientLines = [...client.address, ...(client.email ? [client.email] : [])];
  const clientBlock =
    `<div style="font-size:12pt;line-height:13.4pt">Bill To:</div>` +
    `<div style="margin-top:6.7pt;font-size:15pt;line-height:16.8pt">${or(client.name, "Client")}</div>` +
    `<div style="margin-top:0.7pt;font-size:9.5pt;line-height:13.2pt;color:#333">${clientLines.map(esc).join("<br>")}</div>`;

  // Line items: a shaded header, then one 22.5pt row per item with a rule below.
  const rows = ctx.items.map(item =>
    `<tr style="height:${ROW}pt;border-bottom:0.7pt solid ${RULE}">` +
      `<td style="padding:5.3pt 0 0 13.8pt;font-size:9.5pt;line-height:10.6pt">${esc(item.description)}</td>` +
      `<td style="padding:0.6pt 0 0 0.6pt;font-size:11pt;line-height:12.3pt;white-space:nowrap">${esc(money(item.amount))}</td>` +
    `</tr>`).join("");
  const table =
    `<table style="width:542.2pt">` +
      `<colgroup><col style="width:489.9pt"><col style="width:52.3pt"></colgroup>` +
      `<tr style="height:23.2pt;background:#F8F8F8;border:0.72pt solid ${RULE}">` +
        `<td style="padding:5pt 0 0 14.3pt;font-size:9.5pt;line-height:10.6pt;font-weight:700">Description</td>` +
        `<td style="padding:5pt 0 0 0;font-size:9.5pt;line-height:10.6pt;font-weight:700;overflow:visible;white-space:nowrap">Amount</td>` +
      `</tr>${rows}</table>`;

  // Subtotal and Total: two framed rows under the right of the table.
  const extra = adjustmentRows(ctx);
  const sumRow = (label, value, shaded, bold) =>
    `<tr style="height:23.2pt;${shaded ? "background:#F8F8F8;" : ""}">` +
      `<td style="border:0.7pt solid ${RULE};padding:${shaded ? 3.9 : 6}pt 0 0 ${shaded ? 118.2 : 102.3}pt;font-size:${shaded ? 9.5 : 11}pt;line-height:${shaded ? 10.6 : 12.3}pt;white-space:nowrap;${bold ? "font-weight:700;" : ""}">${esc(label)}</td>` +
      `<td style="border:0.7pt solid ${RULE};padding:${shaded ? 0.1 : 2.3}pt 0 0 ${shaded ? 4.7 : 6.4}pt;font-size:10pt;line-height:11.2pt;white-space:nowrap;${bold ? "font-weight:700;" : ""}">${esc(money(value))}</td>` +
    `</tr>`;
  const sums =
    `<table style="width:212.9pt"><colgroup><col style="width:160.2pt"><col style="width:52.7pt"></colgroup>` +
      sumRow("Subtotal", totals.subtotal, false, false) +
      extra.map(([l, v]) => sumRow(l, v, false, false)).join("") +
      sumRow("Total", totals.total, true, true) +
    `</table>`;

  // Payment: "PayPal: ..." lines on the green bar, a line ending in ":" as
  // the table heading, other "Key: value" lines as striped rows.
  const rowsKV = keyValueRows(ctx.paymentText);
  const paypal = rowsKV.filter(r => /^paypal$/i.test(r.key));
  const heading = rowsKV.find(r => r.key && !r.value && !/^paypal$/i.test(r.key));
  const bank = rowsKV.filter(r => r !== heading && !paypal.includes(r));
  const paypalBar = paypal.map(r =>
    `<div style="width:333.1pt;height:12.7pt;background:${GREEN};color:#fff;font-weight:700;font-size:11pt;line-height:12.7pt;text-align:center">PayPal: ${esc(r.value)}</div>`).join("");
  const bankTable = bank.length ? (
    (heading ? `<div style="margin-left:1.4pt;width:307.8pt;height:10.6pt;background:${GREEN};color:#fff;font-weight:700;font-size:9.5pt;line-height:10.6pt;padding-left:9.6pt">${esc(heading.key)}:</div>` : "") +
    `<table style="margin-top:4.4pt;width:309.5pt;border:0.7pt solid ${TABLE_RULE}"><colgroup><col style="width:143.6pt"><col style="width:165.9pt"></colgroup>` +
      bank.map((r, i) =>
        `<tr style="height:${i === bank.length - 1 ? 16 : 15.05}pt;${i % 2 === 0 ? `background:${STRIPE};` : ""}border-bottom:0.7pt solid ${TABLE_RULE}">` +
          `<td style="border-right:0.7pt solid ${TABLE_RULE};padding:1.2pt 0 0 11.6pt;font-size:9.5pt;line-height:10.6pt">${esc(r.key || r.value)}</td>` +
          `<td style="padding:1.2pt 0 0 11.7pt;font-size:9.5pt;line-height:10.6pt">${r.key ? esc(r.value) : ""}</td>` +
        `</tr>`).join("") +
    `</table>`) : "";

  return renderPage([
    { y: 44, items: [
      el(42, 44, logoImg(ctx, "width:180.2pt;height:74.8pt")),
      el(448.5, 44.8, "INVOICE", { w: 159.5, css: "font-size:24.5pt;line-height:27.4pt;font-weight:700;color:#9C9F9F;text-align:center" }),
      el(472.2, 114.6, meta, { w: 140, css: "font-size:11pt" }),
      el(42, 132.4, companyBlock, { w: 427.2 }),
      el(472.2, 164.8, "Amount due:", { css: "font-size:11pt;line-height:12.3pt" }),
      el(472.2, 177.4, esc(money(totals.total)), { css: "font-size:14pt;line-height:15.6pt;font-weight:700;white-space:nowrap" })
    ] },
    { y: 250.7, items: [el(52.3, 250.7, clientBlock, { w: 520 })] },
    { y: 381.1, items: [el(46.8, 381.1, table)] },
    { y: 471.4, items: [el(375.8, 471.4, sums)] },
    { y: 528, items: [el(27.8, 528, "", { w: 568, css: `height:1pt;background:${RULE}` })] },
    paypal.length ? { y: 575.5, items: [el(137.7, 575.5, paypalBar)] } : null,
    bank.length || heading ? { y: 617.1, items: [el(152.8, 617.1, bankTable)] } : null
  ], { ...LETTER, font: FONTS.arial });
}

export default alisonTemplate({
  id: "alison-janets",
  name: "Janets",
  description: "Janets (Edujanets Ltd) invoice to Alison: grey INVOICE heading, Description / Amount table, PayPal on a green bar and a striped bank table.",
  paper: LETTER.paper,
  fontStack: "Arial",
  layout,
  brand: {
    logo: "janets",
    fields: {
      companyName: "Edujanets Ltd.",
      companyAddress: "3rd Floor, 86-90 Paul Street London EC2A 4NE",
      companyEmail: "Info@janets.org.uk",
      currency: "EUR",
      paymentDetails: [
        "PayPal: info@janets.org.uk",
        "Bank Information:",
        "Account Name: Edujanets Ltd",
        "Bank Sort Code: 30-98-97",
        "Account Number: 60046160",
        "Country: United Kingdom",
        "IBAN: GB60LOYD30989760046160",
        "BIC/SWIFT: LOYDGB21031",
        "Bank Name: Lloyds Bank",
        "VAT No.: 397 6698 10"
      ].join("\n")
    },
    client: {
      clientName: "Alison",
      clientAddress: "Mount Carmel,\nLoughrea, Co Galway, Ireland,\nH62 AV62"
    }
  }
});
