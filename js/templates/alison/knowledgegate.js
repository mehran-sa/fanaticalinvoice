/**
 * Knowledge Gate Alison. Matched to "Knowledgegate Invoice KGA - 005
 * (1).docx" (Purple Academy Ltd, trading as Knowledge Gate, to Alison,
 * # KGA - 005, US Letter, Times New Roman).
 *
 * No logo: the contact, brand and company names in bold top left (type them
 * in Company name separated by " | "), then the address; "INVOICE" and the
 * number top right; the dates and Balance Due on a grey panel; Bill To with
 * the e-mail as a link; a black-headed Description / Amount table; Notes with
 * the bank details, labels in bold.
 */

import { alisonTemplate, renderPage, el, esc, or, money, formatDate, adjustmentRows, FONTS, LETTER } from "./kit.js";

const MUTED = "#777777";
const TEXT = "#333333";

function layout(ctx) {
  const { company, client, invoice, totals } = ctx;
  const date = d => formatDate(d, "DD MMM YYYY");
  const right = (x1, y, html, css) => el(x1 - 200, y, html, { w: 200, css: "text-align:right;white-space:nowrap;" + css });

  const names = company.name ? company.name.split("|").map(s => s.trim()).filter(Boolean) : [];
  const companyBlock = `<div style="font-size:10pt;color:${TEXT}">` +
    (names.length ? names : [""]).map((n, i) => `<div style="font-weight:700;line-height:${i === 0 ? 14.3 : 12.2}pt">${n ? esc(n) : or("", "Your company")}</div>`).join("") +
    `<div style="line-height:11.55pt">${[...company.address, ...[company.phone, company.email].filter(Boolean)].map(esc).join("<br>")}</div></div>`;

  const clientBlock = `<div style="font-size:9.5pt;line-height:16pt;color:${MUTED}">Bill To:</div>` +
    `<div style="font-size:10pt;line-height:15.6pt;font-weight:700;color:${TEXT}">${or(client.name, "Client")}</div>` +
    `<div style="font-size:10pt;line-height:11.5pt;margin-left:-1.9pt">${client.address.map(esc).join("<br>")}</div>` +
    (client.email ? `<div style="margin-top:4.5pt;font-size:10pt;line-height:11.6pt;color:#0000FF;text-decoration:underline">${esc(client.email)}</div>` : "");

  const B = "0.7pt solid #000";
  const extra = adjustmentRows(ctx);
  const table = `<table style="width:538.3pt;font-size:11pt;line-height:12.2pt"><colgroup><col style="width:445.6pt"><col style="width:92.7pt"></colgroup>` +
    `<tr style="height:26.5pt;background:#000;color:#fff;font-weight:700;font-size:12pt;line-height:13.3pt"><td class="c" style="padding-top:6.5pt;border:${B}">Description</td><td class="c" style="padding-top:6.5pt;border:${B}">Amount</td></tr>` +
    ctx.items.map(item => `<tr style="height:21.8pt"><td style="border:${B};padding:2.6pt 0 0 2.2pt">${esc(item.description)}</td>` +
      `<td class="c" style="border:${B};padding-top:1.6pt;color:#555;white-space:nowrap">${esc(money(item.amount))}</td></tr>`).join("") +
    (extra.length ? [["Subtotal", totals.subtotal], ...extra, ["Total", totals.total]].map(([l, v]) =>
      `<tr style="height:21.8pt"><td class="r" style="padding:2.6pt 6pt 0 0">${esc(l)}</td><td class="c" style="border:${B};padding-top:1.6pt;color:#555;white-space:nowrap">${esc(money(v))}</td></tr>`).join("") : "") +
    `</table>`;

  // Notes: any notes, then the payment details; "Label: value" lines with the label bold.
  const noteLines = [...ctx.notes, ...(ctx.notes.length && ctx.payment.length ? [""] : []), ...ctx.payment];
  const notes = `<div style="font-size:10pt;line-height:11.5pt;color:${MUTED}">Notes:</div>` +
    noteLines.map(line => {
      if (!line) return `<div style="height:11.5pt"></div>`;
      const m = /^([^:]{1,40}:)(.*)$/.exec(line);
      return `<div style="font-size:10pt;line-height:11.5pt">${m ? `<b>${esc(m[1])}</b>${esc(m[2])}` : esc(line)}</div>`;
    }).join("");

  return renderPage([
    { y: 22.2, items: [
      el(457.9, 22.2, "INVOICE", { css: "font-size:28.5pt;line-height:31.6pt;color:#444" }),
      el(48.7, 26.5, companyBlock, { w: 406 }),
      el(506.6, 57.6, "# " + esc(invoice.number), { css: `font-size:12pt;line-height:13.3pt;color:${MUTED};white-space:nowrap` })
    ] },
    { y: 128.8, items: [
      el(332.1, 128.8, "", { w: 269, css: "height:41pt;background:#F3F3F3" }),
      el(415.6, 146.8, "Date:", { css: `font-size:9.5pt;line-height:10.5pt;color:${MUTED}` }),
      el(488.6, 145.3, esc(date(invoice.date)), { css: "font-size:12pt;line-height:13.3pt;white-space:nowrap" }),
      right(459.6, 170.6, "Due&nbsp; Date:", `font-size:9.5pt;line-height:10.5pt;color:${MUTED}`),
      el(488.6, 170.4, esc(date(invoice.due)), { css: "font-size:12pt;line-height:13.3pt;white-space:nowrap" }),
      right(459.8, 193.8, "Balance&nbsp; Due:", `font-size:11.5pt;line-height:12.7pt;font-weight:700;color:${TEXT}`),
      el(512.6, 196.2, esc(money(totals.total)), { css: "font-size:10.5pt;line-height:11.6pt;font-weight:700;white-space:nowrap" }),
      el(46.1, 161, clientBlock, { w: 330 })
    ] },
    { y: 323.8, items: [el(37.4, 323.8, table)] },
    { y: 435.2, items: [el(48.6, 435.2, notes, { w: 540 })] }
  ], { ...LETTER, font: FONTS.times });
}

export default alisonTemplate({
  id: "alison-knowledgegate",
  name: "Knowledge Gate",
  description: "Knowledge Gate (Purple Academy Ltd) invoice to Alison: no logo, names in bold (separate them with \" | \" in Company name), grey date panel, black-headed table, Notes with bank details.",
  paper: LETTER.paper,
  fontStack: "Times New Roman",
  layout,
  // The academy's company, bank and PayPal details are kept encrypted in
  // js/secure/vault.js and filled in after the master password is entered.
  brand: {}
});
