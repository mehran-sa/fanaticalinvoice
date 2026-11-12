/**
 * Undo / Redo buttons and keyboard shortcuts.
 *
 * Shortcuts are handled at the document level so they work wherever focus is,
 * including inside the invoice fields. That intentionally replaces the
 * browser's own per-field text undo with document-level undo, which is what an
 * editor with an explicit history is expected to do.
 */

import { $, toast } from "../utils.js";
import { readRaw, writeRaw } from "../storage/local-storage.js";
import { STORAGE_KEYS } from "../constants.js";
import { undoInvoice, redoInvoice, onHistoryChange } from "../history/invoice-history.js";

const isUndo = (key, e) => key === "z" && !e.shiftKey;
const isRedo = (key, e) => key === "y" || (key === "z" && e.shiftKey);

/**
 * Inside a text field, Ctrl+Z normally undoes the last few characters typed.
 * Here it undoes the last change to the invoice, which can be more than that.
 * Said once, the first time it happens in a text field.
 */
function explainUndoOnce(target) {
  if (!target || !target.matches?.("input, textarea")) return;
  if (readRaw(STORAGE_KEYS.undoHintShown) === "1") return;
  writeRaw(STORAGE_KEYS.undoHintShown, "1");
  toast("Ctrl+Z undoes your last change to the invoice, which may be more than the last few characters typed. Ctrl+Y redoes it.");
}

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
      explainUndoOnce(e.target); // after, so the "Undo" message does not cover it
    } else if (isRedo(key, e)) {
      e.preventDefault();
      runRedo();
    }
  });
}
