/**
 * Skill Up Alison. Matched to "Invoice Skill Up - 20260505003 (1).docx"
 * (Skill Up Ltd to Alison, # 20260505003, A4, Arial).
 *
 * The company top left and the logo top right; "To:" Alison; the invoice
 * number and dates on the right; a bordered Service / Price / Quantity / Total
 * table ending in "Total Payment ="; Bank Details; and, from the Terms field,
 * "Authorize by:" with the signatory, the payment terms and a contact line.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, paragraphs, FONTS, A4 } from "./kit.js";

const LINE = "0.5pt solid #000";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "DD/MM/YYYY");

  const companyBlock = `<div style="font-size:11pt;line-height:12.85pt">` +
    `<div style="font-weight:700">${or(company.name, "Your company")}</div>` +
    [...company.address.map((l, i) => (i === 0 ? "Address: " : "") + l), ...(company.phone ? [company.phone] : []), ...(company.email ? [company.email] : [])]
      .map(l => `<div>${esc(l)}</div>`).join("") + `</div>`;

  const clientBlock = `<div style="font-size:11pt;line-height:12.3pt">` +
    `<div style="font-weight:700">To:</div>` +
    `<div style="margin-top:6.5pt;font-weight:700">${or(client.name, "Client")}</div>` +
    [...client.address, ...(client.email ? [client.email] : [])].map(l => `<div style="margin-top:6.7pt">${esc(l)}</div>`).join("") + `</div>`;

  const meta = `<table style="font-size:11pt;line-height:12.3pt;width:132.3pt"><colgroup><col style="width:75pt"><col style="width:57.3pt"></colgroup>` +
    `<tr style="height:17.7pt"><td class="b">Invoice:</td><td class="b" style="white-space:nowrap">#&nbsp;${esc(invoice.number)}</td></tr>` +
    `<tr style="height:17.5pt"><td colspan="2" style="white-space:nowrap"><b>Date of Issue:</b> ${esc(date(invoice.date))}</td></tr>` +
    `<tr><td class="b">Due Date:</td><td class="r" style="white-space:nowrap">${esc(date(invoice.due))}</td></tr></table>`;

  const widths = [162.1, 99, 184.5, 86.1];
  const extra = adjustmentRows(ctx);
  const totalText = [...(extra.length ? [`Subtotal = ${money(totals.subtotal)}`, ...extra.map(([l, v]) => `${l} = ${money(v)}`)] : []), `Total Payment = ${money(totals.total)}`];
  const table = `<table style="width:531.7pt;font-size:11pt;line-height:12.3pt">` +
    `<colgroup>${widths.map(w => `<col style="width:${w}pt">`).join("")}</colgroup>` +
    `<tr style="height:21.7pt;font-size:14pt;line-height:15.6pt;font-weight:700">${["Service", "Price", "Quantity", "Total"].map(h => `<td class="c" style="border:${LINE};padding-top:2.9pt">${h}</td>`).join("")}</tr>` +
    ctx.items.map(item => `<tr style="height:18.4pt">${[item.description, money(item.rate), item.quantityText, money(item.amount)]
      .map(v => `<td class="c" style="border:${LINE};padding-top:3pt">${esc(v)}</td>`).join("")}</tr>`).join("") +
    `<tr style="height:42.3pt"><td colspan="4" class="r" style="border:${LINE};padding:${13.6 - (totalText.length - 1) * 7.8}pt 10.5pt 0 0;font-size:14pt;line-height:15.6pt;font-weight:700">${totalText.map(esc).join("<br>")}</td></tr></table>`;

  // Bank details: the first line bold.
  const bank = ctx.payment.map((line, i) => `<div style="line-height:12.3pt;margin-top:${i ? 2.1 : 0}pt;${i === 0 ? "font-weight:700" : ""}">${line ? esc(line) : "&nbsp;"}</div>`).join("");

  // Terms field: "Authorize by:" with the signatory, then the terms, then the
  // contact line, each a paragraph.
  const paras = paragraphs(ctx.terms);
  const termHtml = paras.map((para, p) => {
    if (p === 0 && /:$/.test(para[0]) && para.length > 1) {
      return `<div style="line-height:12.3pt;font-weight:700">${esc(para[0])}</div>` +
        `<div style="margin-top:1.2pt;font-family:${FONTS.lucida};line-height:16.9pt">${esc(para[1])}</div>` +
        para.slice(2).map(l => `<div style="font-family:${FONTS.calibri};line-height:13.4pt;margin-top:${l === para[2] ? 0.3 : 1.7}pt">${esc(l)}</div>`).join("");
    }
    return `<div style="margin-top:${p === 1 ? 67.6 : 26}pt;line-height:12.3pt">` + para.map(l => {
      const m = /^([^:]{1,30}:)(.*)$/.exec(l);
      return p > 0 && m && p === 1 ? `<b>${esc(m[1])}</b>${esc(m[2])}` : esc(l);
    }).join("<br>") + `</div>`;
  }).join("");

  return renderPage([
    { y: 34.5, items: [
      el(377.2, 34.5, logoImg(ctx, "width:158.9pt;height:56.9pt")),
      el(33, 50.8, companyBlock, { w: 330 })
    ] },
    { y: 125.8, items: [
      el(33, 125.8, clientBlock, { w: 360 }),
      el(403.4, 196.8, meta)
    ] },
    { y: 283.7, items: [el(32.6, 283.7, table)] },
    { y: 418.5, items: [el(33, 418.5, `<div style="font-size:11pt">${bank}</div>`, { w: 540 })] },
    { y: 606.9, items: [el(33, 606.9, `<div style="font-size:11pt">${termHtml}</div>`, { w: 540 })] }
  ], { ...A4, font: FONTS.arial });
}

export default alisonTemplate({
  id: "alison-skillup",
  name: "Skill Up",
  description: "Skill Up Ltd invoice to Alison: logo top right, bordered Service / Price / Quantity / Total table with Total Payment, bank details, Authorize by and terms.",
  paper: A4.paper,
  fontStack: "Arial (Lucida Sans and Calibri for the signatory)",
  layout,
  // The academy's company, bank and PayPal details are kept encrypted in
  // js/secure/vault.js and filled in after the master password is entered.
  brand: { logo: "skillup" }
});
