/**
 * Check and export: one dialog before every PDF or print.
 *
 *  - Problems that stop the export (no number, no lines) first, then
 *    warnings, each with a button that goes to the field.
 *  - What was checked and is fine, so nothing is a mystery.
 *  - The PDF's file name: academy, number and quarter
 *    ("Janets-Alison_2026-11005_Q3-2026"), which can be changed.
 *  - "Mark as issued after exporting", so the invoices board stays true.
 */

import { $, toast, fieldValue } from "../utils.js";
import { runExportChecks, goToIssue } from "../print/export-check.js";
import { pdfFileName } from "../invoice/periods.js";
import { money } from "../invoice/formatters.js";
import { readSettings } from "../settings-store.js";
import { academyBadge } from "../academies.js";
import { setInvoiceStatus } from "../documents.js";
import { state } from "../state.js";
import { flushInvoiceSave } from "../storage/invoice-storage.js";

const WARN_ICON = '<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>';
const STOP_ICON = '<svg aria-hidden="true" focusable="false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
const TICK_ICON = '<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg>';

let printNowFn = null;
let mode = "export";
let lastIssues = [];
let returnFocus = null;

function render() {
  const { issues, passes, context } = runExportChecks();
  lastIssues = issues;
  const blockers = issues.filter(i => i.severity === "blocker");

  $("exportBadge").replaceChildren(academyBadge(context.template, { size: "m" }));
  $("exportTitle").textContent = mode === "print" ? "Check before printing" : "Check before exporting";
  $("exportSub").textContent = [context.academy, context.number ? "invoice " + context.number : "", money(context.total)].filter(Boolean).join(", ");

  const list = $("exportIssues");
  list.replaceChildren(...issues.map(issue => {
    const li = document.createElement("li");
    li.className = "export-issue" + (issue.severity === "blocker" ? " blocker" : "");
    li.innerHTML = issue.severity === "blocker" ? STOP_ICON : WARN_ICON;
    const text = document.createElement("div");
    text.className = "export-issue-text";
    const title = document.createElement("div");
    title.className = "export-issue-title";
    title.textContent = issue.title;
    text.appendChild(title);
    if (issue.detail) {
      const detail = document.createElement("div");
      detail.className = "export-issue-detail";
      detail.textContent = issue.detail;
      text.appendChild(detail);
    }
    const go = document.createElement("button");
    go.type = "button";
    go.className = "btn small";
    go.textContent = issue.goLabel || "Go to it";
    go.onclick = () => {
      close();
      goToIssue(issue);
    };
    li.append(text, go);
    return li;
  }));

  $("exportPasses").replaceChildren(...passes.map(text => {
    const li = document.createElement("li");
    li.className = "export-pass";
    li.innerHTML = TICK_ICON;
    const span = document.createElement("span");
    span.textContent = text;
    li.appendChild(span);
    return li;
  }));

  const settings = readSettings();
  $("pdfFileName").value = pdfFileName({ academy: context.academy, number: context.number, period: context.period }, settings.pdfName);
  const status = fieldValue("invoiceStatus");
  const markLine = $("markIssuedCheck").closest(".check-line");
  markLine.hidden = status !== "draft";
  $("markIssuedCheck").checked = status === "draft" && settings.markIssued !== false;
  $("pdfFileName").closest(".field").hidden = mode === "print";

  const go = $("exportGoBtn");
  const print = $("exportPrintBtn");
  const action = mode === "print" ? "Print" : "Export PDF";
  go.textContent = blockers.length ? action : issues.length ? (mode === "print" ? "Print anyway" : "Export anyway") : action;
  go.disabled = blockers.length > 0;
  go.title = blockers.length ? "Fix the problems above first" : "";
  print.hidden = mode === "print";
  print.disabled = blockers.length > 0;
}

function close() {
  const dialog = $("exportDialog");
  if (dialog.open) dialog.close();
}

function finish(action) {
  const name = ($("pdfFileName").value || "").trim().replace(/\.pdf$/i, "") || "Invoice";
  const mark = !$("markIssuedCheck").closest(".check-line").hidden && $("markIssuedCheck").checked;
  close();
  flushInvoiceSave();
  if (mark) {
    setInvoiceStatus(state.invoiceId, "issued");
    toast("Marked as issued.");
  }
  printNowFn?.(action, name);
}

/**
 * Opens Check and export.
 * @param {"export"|"print"} what
 */
export async function openExportDialog(what = "export") {
  mode = what;
  if (!printNowFn) printNowFn = (await import("../print/pdf.js")).printNow;
  returnFocus = document.activeElement;
  render();
  const dialog = $("exportDialog");
  if (!dialog.open) dialog.showModal();
  const first = $("exportIssues").querySelector("button") || ($("exportGoBtn").disabled ? $("exportBackBtn") : $("exportGoBtn"));
  first?.focus();
  return dialog;
}

export function initExportDialog() {
  const dialog = $("exportDialog");
  if (!dialog) return;
  $("exportBackBtn").onclick = () => {
    close();
    // Back to the first thing to fix, as before 2.14.0.
    if (lastIssues.length) goToIssue(lastIssues[0]);
  };
  $("exportGoBtn").onclick = () => finish(mode);
  $("exportPrintBtn").onclick = () => finish("print");
  $("pdfFileName").addEventListener("keydown", e => {
    if (e.key === "Enter" && !$("exportGoBtn").disabled) {
      e.preventDefault();
      finish(mode);
    }
  });
  dialog.addEventListener("close", () => {
    if (returnFocus && document.contains(returnFocus) && !dialog.contains(document.activeElement)) {
      // Focus goes back only if nothing else (a "Go to" field) took it.
      if (document.activeElement === document.body) returnFocus.focus?.();
    }
  });
  dialog.addEventListener("click", e => { if (e.target === dialog) close(); });
}
