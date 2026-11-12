/** Top toolbar: Export PDF, Print, Export/Import JSON, Reset, spreadsheet import. */

import { $, toast, toastError } from "../utils.js";
import { printInvoice, exportInvoicePDF } from "../print/pdf.js";
import { exportInvoiceJSON, readInvoiceFile } from "../import-export/json.js";
import { readItemsFromFile } from "../import-export/spreadsheet.js";
import { setItems } from "../state.js";
import { renderAll } from "../session.js";
import { confirmAction } from "../ui/confirm-dialog.js";
import { resetInvoiceContent } from "../invoice/reset-text.js";
import { renderItems } from "./items.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice } from "../storage/invoice-storage.js";
import { importAsNewInvoice, newInvoice } from "../documents.js";
import { compareWithStatement } from "../import-export/statement-total.js";
import { getTotals } from "../invoice/calculations.js";
import { money } from "../invoice/formatters.js";

/**
 * Shows how the imported lines compare with the statement's own total.
 * @returns the comparison
 */
export function showImportCheck(el, statementTotal, importedTotal) {
  const check = compareWithStatement(statementTotal, importedTotal);
  if (!el) return check;
  el.hidden = false;
  el.className = "import-check " + (check.status === "mismatch" ? "warn" : check.status === "match" ? "ok" : "");
  if (check.status === "match") {
    el.textContent = `The imported lines add up to ${money(check.imported)}, matching the statement's "${check.statement.label}" row.`;
  } else if (check.status === "mismatch") {
    el.textContent = `The statement's "${check.statement.label}" row says ${money(check.statement.value)}, but the imported lines add up to ${money(check.imported)} (difference ${money(check.difference)}). Check for missing or misread rows, or a currency conversion on the statement.`;
  } else {
    el.textContent = `The imported lines add up to ${money(check.imported)}. No total row was found on the statement to check against.`;
  }
  return check;
}

export function initToolbar() {
  $("printBtn").onclick = () => { printInvoice(); };
  $("pdfBtn").onclick = () => { exportInvoicePDF(); };

  $("exportBtn").onclick = () => exportInvoiceJSON();
  $("importBtn").onclick = () => $("jsonFile").click();
  $("jsonFile").onchange = async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      // Opened as a new saved invoice: nothing already saved is replaced.
      const warnings = importAsNewInvoice(await readInvoiceFile(file));
      toast(warnings.length
        ? "Invoice imported as a new saved invoice, with corrections: " + warnings.join(" ")
        : "Invoice imported as a new saved invoice. Your other invoices are unchanged.");
    } catch (err) {
      toastError(err.message);
    }
  };

  // Clears invoice text only. Kept separate from the full reset below.
  $("resetTextBtn").onclick = async () => {
    const ok = await confirmAction({
      title: "Reset all text fields?",
      message: "This will clear text entered in the current invoice and set the " +
        "invoice date back to today. Saved templates and saved brands will not be deleted.",
      confirmLabel: "Reset text fields",
      danger: true
    });
    if (!ok) return;

    // One state change, one save, therefore one undo step for the whole reset.
    const cleared = resetInvoiceContent();
    renderAll();
    saveInvoice();
    toast(cleared.fields || cleared.itemCells || cleared.dateReset
      ? `Text cleared from ${cleared.fields} field${cleared.fields === 1 ? "" : "s"}. Invoice date reset.`
      : "There was nothing to reset.");
  };

  // "New invoice" (this button was "Reset" before 2.2.0). Nothing is deleted:
  // the current invoice stays in the saved invoices list.
  $("resetBtn").onclick = () => newInvoice();

  $("importSheetBtn").onclick = () => $("sheetFile").click();
  $("sheetFile").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    toast("Reading " + file.name + "\u2026");
    try {
      const { items, statementTotal } = await readItemsFromFile(file);
      setItems(items);
      renderItems();
      renderPreview();
      saveInvoice();
      const check = showImportCheck($("importCheck"), statementTotal, getTotals().subtotal);
      toast(items.length + " items imported." + (check.status === "mismatch" ? " Check the import: it does not match the statement's total." : ""));
    } catch (err) {
      toastError(err.message);
    }
    e.target.value = "";
  };
}
