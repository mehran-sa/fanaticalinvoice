/**
 * Click the invoice to edit it: clicking Bill to, a line, the bank details or
 * the dates on the preview puts the cursor in that field.
 *
 * Templates draw the page in their own way, so the clicked text is matched
 * against what was typed: a line's description or amount, then the invoice
 * number, dates, seller, client, payment details, notes and terms.
 */

import { $, fieldValue } from "../utils.js";
import { state } from "../state.js";
import { calculateItemTotal, amountColumn } from "../invoice/calculations.js";
import { money } from "../invoice/formatters.js";
import { revealElement, scrollEditorTo } from "./tabs.js";

const norm = text => String(text || "").replace(/\s+/g, " ").trim().toLowerCase();
const lines = text => String(text || "").split(/\r?\n/).map(norm).filter(l => l.length >= 2);

const FIELDS = [
  "invoiceNumber", "reference", "clientName", "clientAddress", "clientContact", "clientEmail", "clientTax",
  "companyName", "companyAddress", "companyEmail", "companyPhone", "companyWebsite", "companyReg", "companyVat",
  "paymentDetails", "notes", "terms"
];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Whether a printed date text shows this ISO date (any common format). */
function showsDate(text, iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return false;
  const [, y, mo, d] = m;
  if (!text.includes(y) && !text.includes(y.slice(2))) return false;
  const day = String(Number(d));
  const hasDay = new RegExp(`(^|\\D)0?${day}(\\D|$)`).test(text);
  const hasMonth = text.includes(MONTHS[Number(mo) - 1]) || new RegExp(`(^|\\D)0?${Number(mo)}(\\D|$)`).test(text.replace(y, ""));
  return hasDay && hasMonth;
}

/** The field (element id) a piece of the preview shows, or "". */
export function fieldForText(raw) {
  const text = norm(raw);
  if (!text || text.length > 600) return "";
  // A line: its description, or its amount when only one line has it.
  const desc = state.columns.find(c => c.type === "text" && c.key === "description") || state.columns.find(c => c.type === "text");
  for (let i = 0; i < state.items.length; i++) {
    const d = norm(state.items[i][desc?.key]);
    if (d && d.length >= 3 && (text === d || (text.length >= 4 && d.includes(text)) || (text.includes(d) && text.length < d.length + 40))) return `item-${i}-field-0`;
  }
  const amountCol = amountColumn();
  const amounts = state.items.map(item => norm(money(calculateItemTotal(item, amountCol))));
  const hit = amounts.map((a, i) => (text === a || text.endsWith(" " + a) ? i : -1)).filter(i => i >= 0);
  if (hit.length === 1) {
    const row = $("itemsEditor")?.children[hit[0]];
    const boxes = row?.querySelectorAll("[data-key]") || [];
    if (boxes.length) return boxes[boxes.length - 1].id;
  }
  if (showsDate(text, fieldValue("dueDate")) && /due/.test(text) && !/invoice date/.test(text)) return "dueDate";
  if (showsDate(text, fieldValue("invoiceDate"))) return "invoiceDate";
  if (showsDate(text, fieldValue("dueDate"))) return "dueDate";
  for (const id of FIELDS) {
    for (const line of lines(fieldValue(id))) {
      if (text === line || (line.length >= 4 && text.includes(line) && text.length < line.length + 30) || (text.length >= 5 && line.includes(text))) return id;
    }
  }
  return "";
}

function flash(el) {
  el.classList.add("preview-hit");
  setTimeout(() => el.classList.remove("preview-hit"), 900);
}

export function initPreviewEditing() {
  const page = $("invoice");
  if (!page) return;
  page.addEventListener("click", e => {
    if (!window.getSelection()?.isCollapsed) return;
    let el = e.target instanceof Element ? e.target : null;
    for (let depth = 0; el && el !== page && depth < 5; depth++, el = el.parentElement) {
      const id = fieldForText(el.textContent);
      const field = id && $(id);
      if (!field) continue;
      flash(el);
      document.dispatchEvent(new CustomEvent("sa:show-editor"));
      revealElement(field);
      scrollEditorTo(field, { block: "center" });
      field.focus({ preventScroll: true });
      return;
    }
  });
}
