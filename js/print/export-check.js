/**
 * Checks run before Print and Export PDF (Check and export).
 *
 * Problems that stop an export come first (no invoice number, no lines), then
 * warnings the user can export past: a number another invoice from the same
 * academy uses, a second invoice for the same academy and quarter, a due date
 * before the invoice date, a line that repeats the total (so the total is
 * counted twice), amounts unchanged from last quarter, placeholder text that
 * would print, and so on. Each has a field to go to. Checks that pass are
 * listed too, so the user can see what was looked at. Hidden sections are
 * not checked.
 */

import { $, trimmedField, fieldValue, isIsoDate, num } from "../utils.js";
import { revealElement } from "../editor/tabs.js";
import { state } from "../state.js";
import { getTotals, calculateItemTotal, amountColumn } from "../invoice/calculations.js";
import { money, dateFmt } from "../invoice/formatters.js";
import { invoicesWithNumber, listInvoices, loadSavedInvoice } from "../storage/invoice-library.js";
import { invoicePeriod, linesRepeatingTotal, comparePeriodsDesc } from "../invoice/periods.js";
import { academyName } from "../academies.js";
import { serialize } from "../invoice/invoice-data.js";
import { FIXED_AMOUNT_KEY } from "../constants.js";
import * as TemplateRegistry from "../templates/template-registry.js";

/** The example company name the app starts with. */
export const EXAMPLE_COMPANY_NAME = "Your Company Ltd.";

const COMPANY_DETAIL_FIELDS = ["companyReg", "companyVat", "companyAddress", "companyPhone", "companyEmail", "companyWebsite"];
const CLIENT_DETAIL_FIELDS = ["clientContact", "clientTax", "clientAddress", "clientEmail"];

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const daysBetween = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 864e5);

/** The text column lines are described in. */
const descriptionKey = () =>
  (state.columns.find(c => c.type === "text" && c.key === "description") || state.columns.find(c => c.type === "text"))?.key;

/** Line amounts of a saved invoice, worked out with its own columns. */
function savedAmounts(snapshot) {
  const cols = Array.isArray(snapshot?.columns) ? snapshot.columns : [];
  const q = cols.find(c => c.role === "quantity");
  const r = cols.find(c => c.role === "rate");
  const a = cols.find(c => c.role === "amount");
  return (snapshot?.items || []).map(item => {
    if (typeof item[FIXED_AMOUNT_KEY] === "number") return Math.round(item[FIXED_AMOUNT_KEY] * 100);
    if (q && r) return Math.round(num(item[q.key]) * num(item[r.key]) * 100);
    return Math.round(num(item[a?.key || "amount"]) * 100);
  });
}

/**
 * @returns {{issues: Array<{id: string, severity: "blocker"|"warning", title: string,
 *   detail?: string, field: string, tab: string, goLabel?: string, text: string}>,
 *   passes: string[], context: object}}
 */
export function runExportChecks() {
  const issues = [];
  const passes = [];
  const add = (severity, id, title, field, { detail = "", tab = "invoice", goLabel = "" } = {}) =>
    issues.push({ id, severity, title, detail, field, tab, goLabel, text: detail ? `${title}. ${detail}` : title });
  const shown = key => state.sections[key] !== false;

  const template = fieldValue("template");
  const academy = academyName(template);
  const snapshot = serialize();
  const period = invoicePeriod(snapshot);
  const number = trimmedField("invoiceNumber");
  const totals = getTotals();

  /* ------------------------------------------------- blockers */
  if (!number) add("blocker", "no-number", "There is no invoice number", "invoiceNumber", { detail: 'It would print as "Untitled".' });
  if (!state.items.length) add("blocker", "no-lines", "There are no lines on this invoice", "addItemBtn", { goLabel: "Add a line" });

  /* ------------------------------------- numbers and quarters */
  const others = listInvoices().filter(e => e.id !== state.invoiceId);
  const sameNumber = number ? invoicesWithNumber(number, state.invoiceId, template) : [];
  const samePeriod = period ? others.filter(e => e.template === template && e.period === period) : [];
  if (sameNumber.length) {
    const o = sameNumber[0];
    add("warning", "duplicate-number", `Another ${academy} invoice uses number ${number}`, "invoiceNumber",
      { detail: [o.client && "Billed to " + o.client, o.period, o.invoiceDate && "dated " + dateFmt(o.invoiceDate)].filter(Boolean).join(", ") + "." });
  }
  if (samePeriod.length) {
    const o = samePeriod[0];
    add("warning", "duplicate-period", `${academy} already has a ${period} invoice`, "invoicePeriod",
      { detail: `Invoice ${o.number || "with no number"}${o.total ? ", " + money(o.total, o.currency || undefined) : ""}. Check this one is not a second copy.`, goLabel: "Go to quarter" });
  }
  if (number && !sameNumber.length) {
    passes.push(`No other ${academy} invoice uses number ${number}` + (period && !samePeriod.length ? `, and ${academy} has no other ${period} invoice` : ""));
  }

  /* ------------------------------------------------------ dates */
  const issued = fieldValue("invoiceDate");
  const due = fieldValue("dueDate");
  if (shown("invoiceDate") && !issued) add("warning", "no-date", "There is no invoice date", "invoiceDate");
  if (shown("dueDate") && isIsoDate(issued) && isIsoDate(due) && due < issued) {
    add("warning", "due-before", "The due date is before the invoice date", "dueDate", { detail: `Issued ${dateFmt(issued)}, due ${dateFmt(due)}.` });
  } else if (isIsoDate(issued) && isIsoDate(due)) {
    const days = daysBetween(issued, due);
    passes.push(`Issued ${dateFmt(issued)}, due ${dateFmt(due)} (${days === 0 ? "on receipt" : plural(days, "day")})`);
  }

  /* ----------------------------------------------------- lines */
  if (state.items.length) {
    const descKey = descriptionKey();
    const amountCol = amountColumn();
    const lines = state.items.map(item => ({ description: String(item[descKey] ?? ""), amount: calculateItemTotal(item, amountCol) }));
    for (const index of linesRepeatingTotal(lines)) {
      const line = lines[index];
      const without = totals.total - line.amount;
      add("warning", "repeats-total-" + index, `Line ${index + 1} repeats the total`, `item-${index}-field-0`, {
        detail: `"${line.description || "Line " + (index + 1)} ${money(line.amount)}" equals the other lines added together, so the total is counted twice (${money(totals.total)} instead of ${money(without)}).`,
        goLabel: `Go to line ${index + 1}`
      });
    }
    if (totals.total === 0) add("warning", "zero-total", `The invoice total is ${money(0)}`, "item-0-field-0", { goLabel: "Go to the lines" });

    // Amounts copied from last quarter and never changed.
    const previous = others
      .filter(e => e.template === template && e.period && period && comparePeriodsDesc(e.period, period) > 0)
      .sort((a, b) => comparePeriodsDesc(a.period, b.period))[0];
    if (previous) {
      const before = savedAmounts(loadSavedInvoice(previous.id));
      const now = lines.map(l => Math.round(l.amount * 100));
      if (now.some(Boolean) && before.length === now.length && before.every((v, i) => v === now[i])) {
        add("warning", "same-amounts", `The amounts are the same as on the ${previous.period} invoice`, "item-0-field-0",
          { detail: `Check they are ${period}'s figures (${previous.number}).`, goLabel: "Go to the lines" });
      }
      const currency = fieldValue("currency");
      if (previous.currency && previous.currency !== currency) {
        add("warning", "currency", `The currency is ${currency}, but ${academy}'s ${previous.period} invoice was in ${previous.currency}`, "currency");
      } else if (previous.currency) {
        passes.push(`Currency is ${currency}, as on ${academy}'s earlier invoices`);
      }
    }
    if (totals.total !== 0 && !issues.some(i => i.id.startsWith("repeats-total"))) {
      passes.push(`${plural(state.items.length, "line")}, total ${money(totals.total)}`);
    }
  }

  /* ---------------------------------------- seller and client */
  if (shown("company")) {
    const name = trimmedField("companyName");
    if (!name) add("warning", "company-empty", "Your company name is empty", "companyName", { detail: 'It will print as "Your Company".' });
    else if (name === EXAMPLE_COMPANY_NAME) add("warning", "company-example", `Your company name is still the example "${EXAMPLE_COMPANY_NAME}"`, "companyName");
    if (!COMPANY_DETAIL_FIELDS.some(id => trimmedField(id))) {
      add("warning", "company-details", "Your company details are empty", "companyAddress", { detail: '"Add your company details" will print instead.' });
    }
  }
  if (shown("client")) {
    if (!trimmedField("clientName")) add("warning", "client-empty", "The client is empty", "clientName", { detail: '"Client company" will print instead.' });
    if (!CLIENT_DETAIL_FIELDS.some(id => trimmedField(id))) {
      add("warning", "client-details", "The client details are empty", "clientAddress", { detail: '"Add client details" will print instead.' });
    }
  }
  const paymentShown = shown("payment") || TemplateRegistry.get(template)?.capabilities?.layout;
  if (paymentShown && trimmedField("paymentDetails")) {
    const kinds = [/paypal/i.test(fieldValue("paymentDetails")) && "PayPal", /iban|sort code|account|swift|bic|bank/i.test(fieldValue("paymentDetails")) && "bank"].filter(Boolean);
    passes.push(kinds.length === 2 ? "PayPal and bank details are on the invoice" : kinds.length ? `${kinds[0] === "bank" ? "Bank" : "PayPal"} details are on the invoice` : "Payment details are on the invoice");
  }

  /* -------------------------------------------------- watermark */
  const wmType = fieldValue("watermarkType");
  const wmSupported = Boolean(TemplateRegistry.get(template)?.capabilities?.watermark);
  if (wmSupported && wmType !== "none" && wmType) {
    if (wmType === "text" && !trimmedField("watermarkText")) add("warning", "wm-text", "The watermark is on but has no text", "watermarkText", { tab: "design" });
    if (wmType === "logo" && !state.logo) add("warning", "wm-logo", "The watermark uses the logo, but there is no logo", "watermarkType", { tab: "design" });
    if (wmType === "image" && !state.watermark) add("warning", "wm-image", "The watermark is set to an image, but none is uploaded", "watermarkType", { tab: "design" });
  }

  // Blockers first, then warnings in the order found.
  issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "blocker" ? -1 : 1));
  return { issues, passes, context: { academy, template, period, number, total: totals.total } };
}

/** The problems only, with their text: kept for older callers. */
export const findExportIssues = () => runExportChecks().issues;

/** Shows the tab and panel holding a problem and puts the cursor in its field. */
export function goToIssue(issue) {
  const el = $(issue.field);
  if (!el) return;
  document.dispatchEvent(new CustomEvent("sa:show-editor"));
  revealElement(el);
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus({ preventScroll: true });
}
