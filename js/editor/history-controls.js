/**
 * Undo / Redo buttons and keyboard shortcuts.
 *
 * Shortcuts are handled at the document level so they work wherever focus is,
 * including inside the invoice fields. That intentionally replaces the
 * browser's own per-field text undo with document-level undo, which is what an
 * editor with an explicit history is expected to do.
 */

import { $, toast } from "../utils.js";
import { undoInvoice, redoInvoice, onHistoryChange } from "../history/invoice-history.js";

const isUndo = (key, e) => key === "z" && !e.shiftKey;
const isRedo = (key, e) => key === "y" || (key === "z" && e.shiftKey);

export function initHistoryControls() {
  const undoBtn = $("undoBtn");
  const redoBtn = $("redoBtn");
  if (!undoBtn || !redoBtn) return;

  onHistoryChange(({ canUndo, canRedo }) => {
    undoBtn.disabled = !canUndo;
    redoBtn.disabled = !canRedo;
  });

  const runUndo = () => { if (undoInvoice()) toast("Undo"); };
  const runRedo = () => { if (redoInvoice()) toast("Redo"); };

  undoBtn.onclick = runUndo;
  redoBtn.onclick = runRedo;

  document.addEventListener("keydown", e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = String(e.key || "").toLowerCase();
    if (isUndo(key, e)) {
      e.preventDefault();
      runUndo();
    } else if (isRedo(key, e)) {
      e.preventDefault();
      runRedo();
    }
  });
}
