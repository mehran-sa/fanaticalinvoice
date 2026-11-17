/**
 * Studyhub Alison. Matched to "Q3, 2026 Provider Payout (Alison) (1).docx"
 * (Bluebell Academy Ltd, trading as Studyhub, to Alison, invoice 26300, A4,
 * Arial, small type).
 *
 * The company and e-mail top left, the logo top right; "To" Alison; Invoice,
 * Invoice Date and Amount right-aligned; a Product / Price / Qty. / Line Total
 * list; Subtotal and a boxed Total; Notes with the bank details and PayPal.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, FONTS, A4 } from "./kit.js";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "DD/MM/YY");

  const companyBlock = `<div style="font-size:7.5pt;line-height:8.4pt">` +
    `<div style="font-weight:700">${or(company.name, "Your company")}</div>` +
    [...company.address, company.phone, company.email].filter(Boolean).map(l => `<div style="margin-top:3pt">${esc(l)}</div>`).join("") + `</div>`;

  const clientBlock = `<div style="font-size:7.5pt;line-height:8.4pt;color:#808080">To</div>` +
    `<div style="margin-top:3.2pt;font-size:9pt;line-height:13.2pt"><b>${or(client.name, "Client")}</b>` +
    [...client.address, ...(client.email ? [client.email] : [])].map(l => "<br>" + esc(l)).join("") + `</div>`;

  const meta = `<table style="width:217.2pt;font-size:9pt;line-height:10.1pt"><colgroup><col style="width:110pt"><col style="width:107.2pt"></colgroup>` +
    `<tr><td class="b">Invoice</td><td class="r b">${esc(invoice.number)}</td></tr>` +
    `<tr><td>Invoice Date</td><td class="r">${esc(date(invoice.date))}</td></tr>` +
    `<tr><td style="padding-top:0.5pt">Amount</td><td class="r b" style="font-size:9.5pt;line-height:10.6pt">${esc(money(totals.total))}</td></tr></table>`;

  const colgroup = `<colgroup><col style="width:290.6pt"><col style="width:93.9pt"><col style="width:86.9pt"><col style="width:70.7pt"></colgroup>`;
  const table = `<table style="width:542.1pt;font-size:9pt;line-height:10.1pt">${colgroup}` +
    `<tr style="height:15.4pt;border-bottom:0.7pt solid #A6A6A6"><td class="b" style="padding-left:5pt">Product</td><td class="c b">Price</td><td class="c b">Qty.</td><td class="r b" style="padding-right:22.9pt">Line Total</td></tr>` +
    ctx.items.map((item, i) => `<tr style="height:${i === ctx.items.length - 1 ? 17.9 : 13.8}pt;vertical-align:top${i === ctx.items.length - 1 ? ";border-bottom:0.5pt solid #D9D9D9" : ""}">` +
      `<td style="padding:3pt 0 0 5pt">${esc(item.description)}</td><td class="c" style="padding-top:3pt;white-space:nowrap">${esc(money(item.rate))}</td><td class="c" style="padding-top:3pt">${esc(item.quantityText)}</td>` +
      `<td class="r" style="padding:3pt 21.9pt 0 0;font-size:11pt;line-height:12.3pt;white-space:nowrap;position:relative;top:-1.8pt">${esc(money(item.amount))}</td></tr>`).join("") +
    (ctx.items.length ? "" : `<tr style="height:1pt;border-bottom:0.5pt solid #D9D9D9"><td colspan="4"></td></tr>`) + `</table>`;

  const extra = adjustmentRows(ctx);
  const sums = `<table style="width:249.1pt;font-size:9pt;line-height:10.1pt">` +
    [["Subtotal", totals.subtotal], ...extra].map(([l, v]) => `<tr style="height:17.3pt"><td style="padding-left:10.1pt">${esc(l)}</td><td class="r b" style="padding-right:23pt;white-space:nowrap">${esc(money(v))}</td></tr>`).join("") +
    `</table><div style="width:249.1pt;height:37.6pt;border:1pt solid #000;padding:8.2pt 23pt 0 5.1pt;font-size:9pt;line-height:10.1pt;display:flex;justify-content:space-between">` +
    `<span>Total</span><b style="white-space:nowrap">${esc(money(totals.total))}</b></div>`;

  const notes = `<div style="font-size:9pt;line-height:10.1pt"><div style="font-weight:700">Notes</div>` +
    [...ctx.notes, ...(ctx.notes.length && ctx.payment.length ? [""] : []), ...ctx.payment].map((line, i) => {
      if (!line) return `<div style="height:17.3pt"></div>`;
      const m = /^([^:]{1,30}):(.*)$/.exec(line);
      const html = m && /paypal/i.test(m[1]) ? `<b>${esc(m[1])}:</b>${esc(m[2])}` : esc(line);
      return `<div style="margin-top:${i === 0 ? 4.9 : 7.2}pt">${html}</div>`;
    }).join("") + `</div>`;

  return renderPage([
    { y: 43, items: [
      el(458.5, 43, logoImg(ctx, "width:103.5pt;height:31.5pt")),
      el(43, 54.8, companyBlock, { w: 380 })
    ] },
    { y: 117.8, items: [
      el(43, 117.8, clientBlock, { w: 300 }),
      el(346, 135.8, meta)
    ] },
    { y: 246.4, items: [el(43, 246.4, table)] },
    { y: 306.3, items: [el(337, 306.3, sums)] },
    { y: 394.7, items: [el(43, 394.7, notes, { w: 540 })] }
  ], { ...A4, font: FONTS.arial });
}

export default alisonTemplate({
  id: "alison-studyhub",
  name: "Studyhub",
  description: "Studyhub (Bluebell Academy Ltd) invoice to Alison: small Arial type, Product / Price / Qty. / Line Total list, Subtotal and boxed Total, Notes with bank details and PayPal.",
  paper: A4.paper,
  fontStack: "Arial",
  layout,
  brand: {
    logo: "studyhub",
    fields: {
      companyName: "Studyhub",
      companyEmail: "Info@studyhub.org.uk",
      currency: "EUR",
      paymentDetails: [
        "BLUEBELL ACADEMY LTD",
        "Bank: Lloyds",
        "Sort Code: 30-98-97",
        "Account No: 24685962",
        "IBAN:GB93LOYD30989724685962",
        "IBAN BIC: LOYDGB2LXXXor",
        "",
        "PayPal: info@studyhub.org.uk"
      ].join("\n")
    },
    client: {
      clientName: "Alison",
      clientAddress: "Level One Building\nTechnology Park,\nParkmore, Galway, Ireland"
    }
  }
});
