/**
 * NextGen Learning Alison. Matched to "Nextgen Invoice 13400 - Alison
 * (1).docx" (NextGen Learning to Alison, invoice 136400, A4, Arial, small
 * type).
 *
 * The company and e-mail top left, the logo top right; "To" Alison; Invoice
 * and Invoice Date right-aligned; a Product / Price / Qty. / Total list with
 * grey rules; Closing Balance; Notes beside a boxed Total and Total Due; the
 * bank details and PayPal.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, logoImg, FONTS, A4 } from "./kit.js";

const RULE = "0.7pt solid #B8B8B8";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "DD/MMM/YYYY");

  const companyBlock = `<div style="font-size:8pt;line-height:8.9pt;font-weight:700">` +
    [or(company.name, "Your company"), ...[...company.address, company.phone, company.email].filter(Boolean).map(esc)]
      .map((l, i) => `<div style="margin-top:${i ? 8.8 : 0}pt">${l}</div>`).join("") + `</div>`;

  const clientBlock = `<div style="font-size:8pt;line-height:8.9pt;color:#808080">To</div>` +
    `<div style="margin-top:2.7pt;font-size:9pt;line-height:10.4pt"><b>${or(client.name, "Client")}</b>` +
    [...client.address, ...(client.email ? [client.email] : [])].map(l => "<br>" + esc(l)).join("") + `</div>`;

  const meta = `<table style="width:217.1pt;font-size:9pt;line-height:10.1pt"><colgroup><col style="width:110pt"><col style="width:107.1pt"></colgroup>` +
    `<tr><td class="b">Invoice</td><td class="r b">${esc(invoice.number)}</td></tr>` +
    `<tr><td>Invoice Date</td><td class="r">${esc(date(invoice.date))}</td></tr></table>`;

  // Columns: Product (left) | Price, Qty., Total (right-aligned).
  const colgroup = `<colgroup><col style="width:209.3pt"><col style="width:181.8pt"><col style="width:72.6pt"><col style="width:60pt"></colgroup>`;
  const head = `<tr style="height:15.7pt;border-bottom:${RULE}"><td class="b" style="padding-left:8pt">Product</td><td class="r b" style="padding-right:30.9pt">Price</td><td class="r b" style="padding-right:24pt">Qty.</td><td class="r b" style="padding-right:2.7pt">Total</td></tr>`;
  const rows = ctx.items.map(item => `<tr style="height:31.1pt;border-bottom:${RULE}">` +
    `<td style="padding:3.5pt 0 0 2.5pt" colspan="1">${esc(item.description)}</td>` +
    `<td class="r" style="padding:3.9pt 30.6pt 0 0;white-space:nowrap">${esc(money(item.rate))}</td>` +
    `<td class="r" style="padding:4.3pt 24pt 0 0;font-size:8.5pt;line-height:9.5pt">${esc(item.quantityText)}</td>` +
    `<td class="r" style="padding:3.9pt 2.7pt 0 0;white-space:nowrap">${esc(money(item.amount))}</td></tr>`).join("");
  const table = `<table style="width:523.7pt;font-size:9pt;line-height:10.1pt">${colgroup}${head}${rows}` +
    `<tr style="height:22.7pt"><td></td><td colspan="2" style="padding:11.3pt 0 0 96.3pt;white-space:nowrap">Closing Balance</td><td class="r" style="padding:11.3pt 2.7pt 0 0;white-space:nowrap">${esc(money(totals.subtotal))}</td></tr></table>`;

  const extra = adjustmentRows(ctx);
  const boxRows = [...extra.map(([l, v]) => [l, v, false]), ["Total", totals.total, false], ["Total Due", totals.total, true]];
  const box = `<div style="width:273.3pt;min-height:133.7pt;border:0.96pt solid #000;padding:12.7pt 6.2pt 0 6.2pt;font-size:9pt;line-height:10.1pt">` +
    boxRows.map(([l, v, bold], i) => `<div style="display:flex;justify-content:space-between;margin-top:${i ? 18.2 : 0}pt"><span>${esc(l)}</span>` +
      `<span style="padding-right:22.6pt;white-space:nowrap;${bold ? "font-weight:700" : ""}">${esc(money(v))}</span></div>`).join("") + `</div>`;
  const notes = `<div style="font-size:9pt;line-height:10.1pt;font-weight:700">Notes</div>` +
    (ctx.notes.length ? `<div style="margin-top:4pt;font-size:9pt;line-height:10.35pt;width:265pt">${ctx.notes.map(esc).join("<br>")}</div>` : "");

  const bank = ctx.payment.map(line => {
    if (!line) return `<div style="height:10.35pt"></div>`;
    const m = /^([^:]{1,30}):(.*)$/.exec(line);
    if (m && /paypal/i.test(m[1])) return `<div><b>${esc(m[1])}:</b>${esc(m[2])}</div>`;
    if (m && /account name/i.test(m[1])) return `<div>${esc(m[1])}: <b>${esc(m[2].trim())}</b></div>`;
    return `<div>${esc(line)}</div>`;
  }).join("");

  return renderPage([
    { y: 49.8, items: [
      el(438.4, 49.8, logoImg(ctx, "width:113.5pt;height:48pt")),
      el(42.5, 51.7, companyBlock, { w: 380 })
    ] },
    { y: 125, items: [
      el(34.8, 125, clientBlock, { w: 300 }),
      el(346.4, 142, meta)
    ] },
    { y: 230.8, items: [el(40.2, 230.8, table)] },
    { y: 405.3, items: [
      el(30, 405.3, notes),
      el(303.3, 420, box)
    ] },
    { y: 565.6, items: [el(41.3, 565.6, `<div style="font-size:9pt;line-height:10.35pt">${bank}</div>`, { w: 540 })] }
  ], { ...A4, font: FONTS.arial });
}

export default alisonTemplate({
  id: "alison-nextgen",
  name: "NextGen Learning",
  description: "NextGen Learning invoice to Alison: small Arial type, Product / Price / Qty. / Total list with grey rules, Closing Balance, boxed Total and Total Due, bank details and PayPal.",
  paper: A4.paper,
  fontStack: "Arial",
  layout,
  // The academy's company, bank and PayPal details are kept encrypted in
  // js/secure/vault.js and filled in after the master password is entered.
  brand: { logo: "nextgen" }
});
