/**
 * Course Cloud Alison. Matched to "Invoice ACQ0326.docx" (Edlearn Ltd,
 * trading as Course Cloud, to Alison, invoice ACQ0 326, A4, Jost).
 *
 * The company top left with A: / C: / E: lines, the logo and "Invoice" top
 * right, a black rule; Bill To beside the invoice number and dates; a bordered
 * table with a pale blue header (Description / Payable Amount (Euro)); Total
 * and Balance Due; Payment Details as a bordered table; and the signature,
 * with the signatory's name and role from the Terms field.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, keyValueRows, asset, FONTS, A4 } from "./kit.js";

const BLUE = "#E4F8FF";
const LINE = "1.4pt solid #000";
const ARIAL = `font-family:${FONTS.arial}`;

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "DDo MMMM YYYY");

  const companyBlock =
    `<div style="font-size:15pt;line-height:21.7pt;font-weight:700;letter-spacing:-0.5pt">${or(company.name, "Your company")}</div>` +
    `<div style="font-size:10pt;line-height:14.3pt;letter-spacing:-0.3pt">` +
      [...company.address.map((l, i) => (i === 0 ? "A: " : "") + l), ...(company.phone ? ["C: " + company.phone] : []), ...(company.email ? ["E: " + company.email] : [])]
        .map(l => `<div>${esc(l)}</div>`).join("") + `</div>`;

  const clientLines = [
    ...client.address.map((l, i) => (i === 0 ? "<i>Address:</i> " : "") + esc(l)),
    ...(client.email ? ["<i>Email:</i> " + esc(client.email)] : [])
  ];
  const clientBlock = `<table style="font-size:10pt;line-height:13.85pt;letter-spacing:-0.3pt"><colgroup><col style="width:40.2pt"><col style="width:300pt"></colgroup>` +
    `<tr><td class="b">Bill To</td><td class="b">${or(client.name, "Client")}</td></tr>` +
    clientLines.map(l => `<tr><td></td><td>${l}</td></tr>`).join("") + `</table>`;

  const meta = `<table style="font-size:10pt;line-height:13.85pt;letter-spacing:-0.3pt;width:154.7pt"><colgroup><col style="width:64pt"><col style="width:90.7pt"></colgroup>` +
    [["Invoice no.", invoice.number], ["Date", date(invoice.date)], ["Due Date", date(invoice.due)]]
      .map(([l, v]) => `<tr><td class="r b">${esc(l)}</td><td class="r" style="white-space:nowrap">${esc(v)}</td></tr>`).join("") + `</table>`;

  const table = `<table style="width:539.1pt;font-size:10pt;line-height:14.4pt;border:${LINE}"><colgroup><col style="width:357.5pt"><col style="width:181.6pt"></colgroup>` +
    `<tr style="height:44.4pt;background:${BLUE}"><td class="c b" style="border:${LINE};vertical-align:middle;letter-spacing:-0.5pt">Description</td><td class="c b" style="border:${LINE};vertical-align:middle;letter-spacing:-0.5pt">Payable Amount (Euro)</td></tr>` +
    ctx.items.map(item => `<tr style="height:30.75pt"><td class="c" style="border:${LINE};vertical-align:middle;letter-spacing:-0.3pt">${esc(item.description)}</td>` +
      `<td class="c" style="border:${LINE};vertical-align:middle;${ARIAL};white-space:nowrap">${esc(money(item.amount))}</td></tr>`).join("") + `</table>`;

  const extra = adjustmentRows(ctx);
  const totalRows = [...(extra.length ? [["Subtotal", totals.subtotal], ...extra] : []), ["Total.", totals.total], ["Balance Due", totals.total]];
  const sums = `<table style="width:209.4pt;font-size:10pt;letter-spacing:-0.4pt"><colgroup><col style="width:61pt"><col style="width:148.4pt"></colgroup>` +
    totalRows.map(([l, v], i) => `<tr><td class="r b" style="line-height:13.9pt">${esc(l)}</td>` +
      `<td class="r b" style="${ARIAL};font-size:11pt;line-height:13.9pt;letter-spacing:0;white-space:nowrap;padding-top:${i === totalRows.length - 1 ? 1.4 : 1.7}pt">${esc(money(v))}</td></tr>`).join("") +
    `</table><div style="margin:1.1pt 0 0 -134.7pt;width:345.4pt;height:1.4pt;background:#000"></div>`;

  const rows = keyValueRows(ctx.paymentText);
  const payment = rows.length ? `<div style="font-size:15pt;line-height:21.7pt;font-weight:700;letter-spacing:-0.5pt">Payment Details</div>` +
    `<table style="margin-top:6pt;width:539.1pt;font-size:10pt;line-height:14.4pt;letter-spacing:-0.3pt;border:${LINE}"><colgroup><col style="width:177.8pt"><col style="width:361.3pt"></colgroup>` +
    rows.map(r => `<tr style="height:30.7pt"><td class="c" style="border:${LINE};background:${BLUE};vertical-align:middle">${esc(r.key)}</td>` +
      `<td class="c" style="border:${LINE};vertical-align:middle">${esc(r.value)}</td></tr>`).join("") + `</table>` : "";

  // Signature: the image, a rule, then the Terms lines right-aligned.
  const signature = asset("coursecloud-signature");
  const sign = ctx.terms.length ? `<div style="width:193.2pt;text-align:right">` +
    (signature ? `<img src="${signature}" alt="" style="display:inline-block;width:101.4pt;height:25.1pt;margin-right:3.6pt">` : `<div style="height:25.1pt"></div>`) +
    `<div style="margin-top:2.9pt;height:1.4pt;background:#000"></div>` +
    `<div style="margin-top:1.8pt;font-size:10pt;line-height:13.8pt;font-weight:700;letter-spacing:-0.6pt;padding-right:0.4pt">${ctx.terms.map(esc).join("<br>")}</div></div>` : "";

  return renderPage([
    { y: 22.8, items: [
      el(348.1, 22.8, logoImg(ctx, "width:210.3pt;height:35.2pt")),
      el(19.3, 26.9, companyBlock, { w: 330 }),
      el(400, 82.3, "Invoice", { w: 158.4, css: "font-size:18pt;line-height:26pt;font-weight:700;letter-spacing:-0.9pt;text-align:right" }),
      el(17.9, 112, "", { w: 542.1, css: "height:1.4pt;background:#000" })
    ] },
    { y: 137.9, items: [
      el(19.3, 137.9, clientBlock),
      el(401, 137.9, meta)
    ] },
    { y: 221.3, items: [el(18.8, 221.3, table)] },
    { y: 432.2, items: [el(348.3, 432.2, sums)] },
    { y: 478.2, items: [el(19.3, 478.2, payment)] },
    { y: 769.4, items: [el(366.8, 769.4, sign)] }
  ], { ...A4, font: FONTS.jost });
}

export default alisonTemplate({
  id: "alison-coursecloud",
  name: "Course Cloud",
  description: "Course Cloud (Edlearn Ltd) invoice to Alison: pale blue bordered tables, Total and Balance Due, Payment Details table and a signature.",
  paper: A4.paper,
  fontStack: "Jost (included) + Arial amounts",
  layout,
  // The academy's company, bank and PayPal details are kept encrypted in
  // js/secure/vault.js and filled in after the master password is entered.
  brand: { logo: "coursecloud" }
});
