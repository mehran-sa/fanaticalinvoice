/** Top toolbar: Export PDF, Print, Export/Import JSON, Reset, spreadsheet import. */

import { $, toast } from "../utils.js";
import { printInvoice, exportInvoicePDF } from "../print/pdf.js";
import { exportInvoiceJSON, readInvoiceFile } from "../import-export/json.js";
import { readItemsFromFile } from "../import-export/spreadsheet.js";
import { setItems } from "../state.js";
import { applySnapshot, renderAll } from "../session.js";
import { confirmAction } from "../ui/confirm-dialog.js";
import { resetInvoiceContent } from "../invoice/reset-text.js";
import { renderItems } from "./items.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice, clearInvoice } from "../storage/invoice-storage.js";

export function initToolbar() {
  $("printBtn").onclick = () => { printInvoice(); };
  $("pdfBtn").onclick = () => { exportInvoicePDF(); };

  $("exportBtn").onclick = () => exportInvoiceJSON();
  $("importBtn").onclick = () => $("jsonFile").click();
  $("jsonFile").onchange = async e => {
    try {
      applySnapshot(await readInvoiceFile(e.target.files[0]));
      toast("Invoice imported.");
    } catch (err) {
      toast(err.message);
    }
    e.target.value = "";
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

  $("resetBtn").onclick = () => {
    if (!confirm("Reset the app and delete the locally saved invoice?")) return;
    clearInvoice();
    location.reload();
  };

  $("importSheetBtn").onclick = () => $("sheetFile").click();
  $("sheetFile").onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const items = await readItemsFromFile(file);
      setItems(items);
      renderItems();
      renderPreview();
      saveInvoice();
      toast(items.length + " items imported.");
    } catch (err) {
      toast(err.message);
    }
    e.target.value = "";
  };
}
