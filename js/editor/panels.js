/**
 * Collapsible sidebar panels.
 *
 * Every panel is a <details> element, so it opens and closes with a click or
 * the keyboard and screen readers announce its state. Each panel remembers
 * whether it was left open (per browser). On first use:
 *   open    Invoice, Bill to, Line items, Totals, Saved invoices, Backup,
 *           Invoice template
 *   closed  Royalty bundle splitter, Columns, Show or hide sections,
 *           Saved templates and brands
 *   Your company, and Notes, payment and terms, start closed once they have
 *   been filled in (company name; payment details), since they rarely change
 *   between invoices.
 *
 * A short summary next to each title says what is inside, so a closed panel
 * still shows its state ("3 items, £70.04", "5 of 5 shown").
 */

import { $, qsa, trimmedField, fieldValue } from "../utils.js";
import { STORAGE_KEYS } from "../constants.js";
import { state } from "../state.js";
import { readJSON, writeJSON } from "../storage/local-storage.js";
import { getTotals } from "../invoice/calculations.js";
import { money, dateFmt } from "../invoice/formatters.js";
import { listTemplates } from "../storage/template-library.js";
import { listBrands } from "../storage/brand-library.js";
import { onInvoiceWritten } from "../storage/invoice-storage.js";
import { EXAMPLE_COMPANY_NAME } from "../print/export-check.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const setSummary = (id, text) => { const el = $(id); if (el && el.textContent !== text) el.textContent = text; };

export function updatePanelSummaries() {
  const number = trimmedField("invoiceNumber");
  const date = fieldValue("invoiceDate");
  setSummary("sumInvoice", [number || "No number", date ? dateFmt(date) : ""].filter(Boolean).join(", "));
  setSummary("sumClient", trimmedField("clientName").split(/\r?\n/)[0] || "No client yet");
  const totals = getTotals();
  setSummary("sumItems", state.items.length ? `${plural(state.items.length, "item")}, ${money(totals.subtotal)}` : "No items yet");
  setSummary("sumTotals", "Total " + money(totals.total));
  setSummary("sumCompany", trimmedField("companyName") || "Not filled in");
  const footer = [["notes", "notes"], ["paymentDetails", "payment details"], ["terms", "terms"]]
    .filter(([id]) => trimmedField(id)).map(([, label]) => label);
  setSummary("sumFooter", footer.length ? footer.join(", ").replace(/^./, c => c.toUpperCase()) : "Nothing added");
  setSummary("sumTemplate", $("template")?.selectedOptions[0]?.textContent || "");
  const shownColumns = state.columns.filter(c => c.visible !== false).length;
  setSummary("sumColumns", `${shownColumns} of ${state.columns.length} shown`);
  const sections = Object.values(state.sections);
  setSummary("sumSections", `${sections.filter(Boolean).length} of ${sections.length} shown`);
  setSummary("sumLibrary", `${plural(listTemplates().length, "template")}, ${plural(listBrands().length, "brand")}`);
}

function defaultOpen(panel) {
  const rule = panel.dataset.default;
  if (rule === "closed") return false;
  if (rule === "auto-footer") {
    // Notes, payment and terms: payment details are usually set once.
    return !trimmedField("paymentDetails");
  }
  if (rule === "auto") {
    // "Your company": open until it has been filled in.
    const name = trimmedField("companyName");
    return !name || name === EXAMPLE_COMPANY_NAME;
  }
  return true;
}

export function initPanels() {
  const saved = readJSON(STORAGE_KEYS.panelsOpen, {}) || {};
  for (const panel of qsa("details.panel")) {
    panel.open = typeof saved[panel.id] === "boolean" ? saved[panel.id] : defaultOpen(panel);
    panel.addEventListener("toggle", () => {
      const now = readJSON(STORAGE_KEYS.panelsOpen, {}) || {};
      now[panel.id] = panel.open;
      writeJSON(STORAGE_KEYS.panelsOpen, now);
    });
  }

  // Summaries follow every change: saves, typing, and clicks that change
  // sections, columns or the library.
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(updatePanelSummaries, 200);
  };
  onInvoiceWritten(schedule);
  for (const type of ["input", "change", "click"]) document.addEventListener(type, schedule, true);
  updatePanelSummaries();
}
