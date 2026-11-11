/**
 * Checks run before Print and Export PDF.
 *
 * Empty fields print as placeholder text ("Your Company", "Client company",
 * "Add your company details"), and mistakes such as a missing invoice number
 * or a due date before the invoice date are easy to miss in the preview. The
 * check lists anything like that, and the user can go back to fix it or print
 * anyway. Hidden sections are not checked.
 */

import { $, trimmedField, fieldValue, isIsoDate } from "../utils.js";
import { revealElement } from "../editor/tabs.js";
import { state } from "../state.js";
import { getTotals } from "../invoice/calculations.js";
import { money } from "../invoice/formatters.js";
import { invoicesWithNumber } from "../storage/invoice-library.js";
import * as TemplateRegistry from "../templates/template-registry.js";

/** The example company name the app starts with. */
export const EXAMPLE_COMPANY_NAME = "Your Company Ltd.";

const COMPANY_DETAIL_FIELDS = ["companyReg", "companyVat", "companyAddress", "companyPhone", "companyEmail", "companyWebsite"];
const CLIENT_DETAIL_FIELDS = ["clientContact", "clientTax", "clientAddress", "clientEmail"];

/**
 * @returns {Array<{text: string, tab: string, field: string}>} problems, in
 *          the order they appear on the invoice
 */
export function findExportIssues() {
  const issues = [];
  const add = (text, tab, field) => issues.push({ text, tab, field });
  const shown = key => state.sections[key] !== false;

  const number = trimmedField("invoiceNumber");
  if (!number) add('There is no invoice number. It will print as "Untitled".', "invoice", "invoiceNumber");
  else if (invoicesWithNumber(number, state.invoiceId).length) {
    add(`Another saved invoice already uses number ${number}.`, "invoice", "invoiceNumber");
  }

  if (shown("invoiceDate") && !fieldValue("invoiceDate")) add("There is no invoice date.", "invoice", "invoiceDate");
  const issued = fieldValue("invoiceDate");
  const due = fieldValue("dueDate");
  if (shown("dueDate") && isIsoDate(issued) && isIsoDate(due) && due < issued) {
    add("The due date is before the invoice date.", "invoice", "dueDate");
  }

  if (shown("company")) {
    const name = trimmedField("companyName");
    if (!name) add('Your company name is empty. It will print as "Your Company".', "invoice", "companyName");
    else if (name === EXAMPLE_COMPANY_NAME) add(`Your company name is still the example "${EXAMPLE_COMPANY_NAME}".`, "invoice", "companyName");
    if (!COMPANY_DETAIL_FIELDS.some(id => trimmedField(id))) {
      add('Your company details are empty. "Add your company details" will print instead.', "invoice", "companyAddress");
    }
  }

  if (shown("client")) {
    if (!trimmedField("clientName")) add('The client is empty. "Client company" will print instead.', "invoice", "clientName");
    if (!CLIENT_DETAIL_FIELDS.some(id => trimmedField(id))) {
      add('The client details are empty. "Add client details" will print instead.', "invoice", "clientAddress");
    }
  }

  // A watermark switched on with nothing to show prints nothing: say so.
  const wmType = fieldValue("watermarkType");
  const wmSupported = Boolean(TemplateRegistry.get(fieldValue("template"))?.capabilities?.watermark);
  if (wmSupported && wmType !== "none" && wmType) {
    if (wmType === "text" && !trimmedField("watermarkText")) add("The watermark is on but has no text.", "design", "watermarkText");
    if (wmType === "logo" && !state.logo) add("The watermark uses the logo, but there is no logo.", "design", "watermarkType");
    if (wmType === "image" && !state.watermark) add("The watermark is set to an image, but none is uploaded.", "design", "watermarkType");
  }

  if (!state.items.length) add("There are no line items.", "invoice", "addItemBtn");
  else if (getTotals().total === 0) add(`The invoice total is ${money(0)}.`, "invoice", "addItemBtn");

  return issues;
}

/** Shows the tab and panel holding a problem and puts the cursor in its field. */
export function goToIssue(issue) {
  const el = $(issue.field);
  if (!el) return;
  revealElement(el);
  el.scrollIntoView({ block: "center", behavior: "smooth" });
  el.focus({ preventScroll: true });
}
