/**
 * Alison Statement Grabber: paste an Alison payout statement, and its amounts
 * become line items. It asks which: all the lines (opening balance, the
 * quarter's earnings, any deduction), or only the quarter's earnings. Totals
 * on the statement (closing balance, proposed payment) are never added as
 * lines; the invoice total is checked against them instead.
 *
 * A statement pasted anywhere in the editor (outside another text box), into
 * a line's description, or into "Paste from Excel" is brought here.
 */

import { $, toast, fieldValue, setFieldValue } from "../utils.js";
import { money } from "../invoice/formatters.js";
import { parseAlisonStatement, looksLikeStatement } from "../import-export/alison-statement.js";
import { state } from "../state.js";
import { confirmAction } from "../ui/confirm-dialog.js";
import { replaceLines } from "./items.js";
import { getTotals } from "../invoice/calculations.js";
import { revealElement, scrollEditorTo } from "./tabs.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice } from "../storage/invoice-storage.js";

let parsed = null;

const fmt = (amount, currency) => money(amount, currency || fieldValue("currency"));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function render() {
  const text = $("statementText").value;
  const result = $("statementResult");
  const error = $("statementError");
  parsed = text.trim() ? parseAlisonStatement(text) : null;
  if (!parsed || !parsed.lines.length) {
    result.hidden = true;
    error.hidden = !text.trim();
    error.textContent = "No amounts were found. Each amount should be on its own line, like “Opening Balance: €29,000.00”.";
    $("sumStatement").textContent = "For Alison payout statements";
    return;
  }
  error.hidden = true;
  result.hidden = false;
  const cur = parsed.currency;
  $("statementTitle").textContent = parsed.title || (parsed.period ? parsed.period + " statement" : "Statement");
  $("statementSub").textContent = [parsed.period && "for " + parsed.period, cur].filter(Boolean).join(", ");
  $("statementRows").replaceChildren(...parsed.rows.map(row => {
    const tr = document.createElement("tr");
    tr.className = "kind-" + row.kind;
    const label = document.createElement("th");
    label.scope = "row";
    label.textContent = row.label;
    const amount = document.createElement("td");
    amount.className = "num";
    amount.textContent = fmt(row.amount, cur);
    const tag = document.createElement("td");
    tag.className = "statement-tag";
    tag.textContent = row.kind === "total" ? "Total, not a line" : row === parsed.quarter ? "Quarter" : "Line";
    tr.append(label, amount, tag);
    return tr;
  }));

  const check = $("statementCheck");
  if (parsed.check) {
    const ok = Math.round(parsed.sum * 100) === Math.round(parsed.check.amount * 100);
    check.className = "import-check " + (ok ? "ok" : "warn");
    check.textContent = ok
      ? `The lines add up to ${fmt(parsed.sum, cur)}, matching the statement's ${parsed.check.label}.`
      : `The lines add up to ${fmt(parsed.sum, cur)}, but the statement's ${parsed.check.label} is ${fmt(parsed.check.amount, cur)}. Check the statement was copied in full.`;
    check.hidden = false;
  } else {
    check.hidden = true;
  }

  const all = $("statementAllBtn");
  all.textContent = `Add all ${plural(parsed.lines.length, "line")} (${fmt(parsed.sum, cur)})`;
  const quarter = $("statementQuarterBtn");
  quarter.hidden = !parsed.quarter;
  if (parsed.quarter) quarter.textContent = `Add only ${parsed.quarter.label} (${fmt(parsed.quarter.amount, cur)})`;
  $("sumStatement").textContent = `${parsed.period || "Statement"}: ${plural(parsed.lines.length, "line")} read`;
}

async function apply(which) {
  if (!parsed) return;
  const rows = which === "quarter" && parsed.quarter ? [parsed.quarter] : parsed.lines;
  if (state.items.length) {
    const ok = await confirmAction({
      title: "Replace the lines on this invoice?",
      message: `This invoice has ${plural(state.items.length, "line")}. ${which === "quarter" ? "The quarter's earnings replace them" : `The statement's ${plural(rows.length, "line")} replace them`}. You can bring them back with Undo.`,
      confirmLabel: "Replace lines"
    });
    if (!ok) return;
  }
  const notes = [];
  if (parsed.currency && parsed.currency !== fieldValue("currency") && [...$("currency").options].some(o => o.value === parsed.currency)) {
    setFieldValue("currency", parsed.currency);
    notes.push(`currency set to ${parsed.currency}`);
  }
  if (parsed.period && fieldValue("invoicePeriod") !== parsed.period) {
    setFieldValue("invoicePeriod", parsed.period);
    notes.push(`quarter set to ${parsed.period}`);
  }
  replaceLines(rows.map(r => ({ description: r.label, quantity: null, rate: null, amount: r.amount })));
  renderPreview();
  saveInvoice();
  const total = getTotals().total;
  let message = `${plural(rows.length, "line")} added from the statement. Total ${money(total)}`;
  if (which === "quarter" && parsed.check) message += `; the statement's ${parsed.check.label} is ${money(parsed.check.amount)}`;
  toast(message + (notes.length ? ". Also " + notes.join(" and ") + "." : "."));
  $("statementText").value = "";
  render();
  revealElement($("itemsEditor"));
  scrollEditorTo($("panel-items"));
}

/** Brings a pasted statement into the grabber and asks which lines to add. */
export function grabStatement(text) {
  const panel = $("panel-statement");
  revealElement(panel);
  panel.open = true;
  document.dispatchEvent(new CustomEvent("sa:show-editor"));
  // Tidied: no stray spaces or empty lines from the copied page.
  $("statementText").value = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean).join("\n");
  render();
  scrollEditorTo(panel);
  (parsed?.lines.length ? $("statementAllBtn") : $("statementText")).focus({ preventScroll: true });
}

export { looksLikeStatement };

export function initStatementGrabber() {
  if (!$("panel-statement")) return;
  $("statementText").addEventListener("input", render);
  $("statementAllBtn").onclick = () => apply("all");
  $("statementQuarterBtn").onclick = () => apply("quarter");
  $("statementClearBtn").onclick = () => { $("statementText").value = ""; render(); $("statementText").focus(); };

  // A statement pasted anywhere in the editor that is not a text box.
  document.addEventListener("paste", e => {
    const target = e.target;
    if (document.body.dataset.view && document.body.dataset.view !== "editor") return;
    if (target instanceof Element && target.closest("input, textarea, select, [contenteditable], dialog")) return;
    const text = e.clipboardData?.getData("text/plain") || "";
    if (!looksLikeStatement(text)) return;
    e.preventDefault();
    grabStatement(text);
  });
  document.addEventListener("sa:statement", e => grabStatement(e.detail));
}
