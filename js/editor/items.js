/** Line item editor: the compact item rows in the Items tab. */

import { $, esc, num } from "../utils.js";
import { calculateItemTotal, amountColumn } from "../invoice/calculations.js";
import { money } from "../invoice/formatters.js";
import { NUMERIC_COLUMN_TYPES, FIXED_AMOUNT_KEY } from "../constants.js";
import { state, editableColumns, addItem, removeItemAt, clearItems, createBlankItem } from "../state.js";
import { renderPreview, requestPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice } from "../storage/invoice-storage.js";
import { confirmAction } from "../ui/confirm-dialog.js";

const isNumericType = type => NUMERIC_COLUMN_TYPES.includes(type);

/** The description column gets a full-width textarea. */
const isDescriptionField = col => col.type === "text" && col.key === "description";
const inputTypeFor = col => (isNumericType(col.type) ? "number" : col.type === "date" ? "date" : "text");

/**
 * Fields in the order people type them: description, quantity, rate, then the
 * rest in column order. (The printed column order is unchanged.)
 */
const fieldRank = col => (isDescriptionField(col) ? 0 : col.role === "quantity" ? 1 : col.role === "rate" ? 2 : 3);
const orderedFields = cols => cols.map((c, i) => [c, i]).sort((a, b) => fieldRank(a[0]) - fieldRank(b[0]) || a[1] - b[1]).map(([c]) => c);

/** Adds a blank line and puts the cursor in its first field. */
function addLineAndFocus() {
  addItem(createBlankItem());
  appendLastItemRow();
  renderPreview();
  saveInvoice();
  const rows = $("itemsEditor").children;
  rows[rows.length - 1]?.querySelector("[data-key]")?.focus();
}

/** Private drag type, so drops from outside the item list are ignored. */
const ITEM_DRAG_TYPE = "application/x-sa-invoice-item";

/** The field id is built from positions, never from user text, so it is always valid. */
const itemFieldMarkup = (col, item, itemIndex, colIndex) => {
  const value = esc(item[col.key] ?? "");
  const key = esc(col.key);
  const id = `item-${itemIndex}-field-${colIndex}`;
  const control = isDescriptionField(col)
    ? `<textarea id="${id}" data-key="${key}" rows="1">${value}</textarea>`
    : `<input id="${id}" data-key="${key}" type="${inputTypeFor(col)}" step="0.01" value="${value}">`;
  return `<div class="field ${isDescriptionField(col) ? "full" : ""}"><label for="${id}">${esc(col.label)}</label>${control}</div>`;
};

/** The line total shown on each row (what the Amount column prints). */
const lineTotalText = item => money(calculateItemTotal(item, amountColumn()));

/**
 * Grows a description box to fit its text, so short lines stay one row high.
 * Browsers that support CSS field-sizing do this by themselves (see
 * .itemrow textarea in css/components.css), with no measuring at all.
 */
const AUTO_SIZED = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");
const fitTextarea = el => {
  if (AUTO_SIZED) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + 2 + "px";
};

/**
 * Fits many boxes at once: all writes, then all reads, then all writes, so the
 * browser lays the page out once rather than once per box (1,000 layouts on a
 * 1,000-line statement).
 */
const fitTextareas = list => {
  if (AUTO_SIZED || !list.length) return;
  list.forEach(el => { el.style.height = "auto"; });
  const heights = list.map(el => el.scrollHeight);
  list.forEach((el, i) => { el.style.height = heights[i] + 2 + "px"; });
};

function moveItem(from, to) {
  if (from === to || from < 0 || to < 0 || from >= state.items.length || to >= state.items.length) return false;
  const [item] = state.items.splice(from, 1);
  state.items.splice(to, 0, item);
  renderItems();
  renderPreview();
  saveInvoice();
  return true;
}

/**
 * Line items as compact rows: number, line total and controls on top, the
 * description on its own line, the other fields in a tight grid.
 * Reorder by dragging the handle, or with the Up/Down buttons (keyboard).
 */
export function renderItems() {
  const root = $("itemsEditor");
  // Description first (full width), then the short fields share one line.
  const editable = orderedFields(editableColumns());
  const fragment = document.createDocumentFragment();
  state.items.forEach((item, idx) => fragment.appendChild(createItemRow(item, idx, editable)));
  root.replaceChildren(fragment);
  const boxes = [...root.querySelectorAll("textarea[data-key]")];
  requestAnimationFrame(() => fitTextareas(boxes));
}

/**
 * Adds the row for the last item without rebuilding the others (adding a line
 * to a long statement redrew every row before).
 */
function appendLastItemRow() {
  const root = $("itemsEditor");
  const idx = state.items.length - 1;
  if (idx < 0 || root.children.length !== idx) {
    renderItems();
    return;
  }
  // The row above can now move down.
  const above = root.children[idx - 1]?.querySelector(".move-down");
  if (above) above.disabled = false;
  const row = createItemRow(state.items[idx], idx, orderedFields(editableColumns()));
  root.appendChild(row);
  fitTextareas([...row.querySelectorAll("textarea[data-key]")]);
}

function createItemRow(item, idx, editable) {
  const root = $("itemsEditor");
  const row = document.createElement("div");
  row.className = "itemrow";
  const n = idx + 1;
  const last = () => state.items.length - 1;
  row.innerHTML =
    `<div class="itemrow-head">` +
      `<span class="drag" title="Drag to reorder" aria-hidden="true">\u2630</span>` +
      `<strong class="itemrow-num">Item ${n}</strong>` +
      `<span class="itemrow-total" aria-label="Line total">${lineTotalText(item)}</span>` +
      `<button class="btn icon move-up" type="button" aria-label="Move item ${n} up" title="Move up"${idx === 0 ? " disabled" : ""}>\u2191</button>` +
      `<button class="btn icon move-down" type="button" aria-label="Move item ${n} down" title="Move down"${idx === last() ? " disabled" : ""}>\u2193</button>` +
      `<button class="btn icon danger remove" type="button" aria-label="Remove item ${n}" title="Remove item">\u00d7</button>` +
    `</div>` +
    `<div class="itemrow-fields">${editable.map((c, ci) => itemFieldMarkup(c, item, idx, ci)).join("")}</div>`;

  row.querySelector(".remove").onclick = () => {
    removeItemAt(idx);
    renderItems();
    renderPreview();
    saveInvoice();
  };
  row.querySelector(".move-up").onclick = () => {
    if (moveItem(idx, idx - 1)) root.children[idx - 1]?.querySelector(idx - 1 === 0 ? ".move-down" : ".move-up")?.focus();
  };
  row.querySelector(".move-down").onclick = () => {
    if (moveItem(idx, idx + 1)) root.children[idx + 1]?.querySelector(idx + 1 === last() ? ".move-up" : ".move-down")?.focus();
  };

  // Only the handle starts a drag, so selecting text in a field still works.
  const handle = row.querySelector(".drag");
  handle.onpointerdown = () => { row.draggable = true; };
  row.ondragstart = e => {
    e.dataTransfer.setData(ITEM_DRAG_TYPE, String(idx));
    e.dataTransfer.effectAllowed = "move";
    row.classList.add("dragging");
  };
  row.ondragend = () => { row.draggable = false; row.classList.remove("dragging"); };
  row.ondragover = e => {
    if ([...e.dataTransfer.types].includes(ITEM_DRAG_TYPE)) e.preventDefault();
  };
  row.ondrop = e => {
    if (![...e.dataTransfer.types].includes(ITEM_DRAG_TYPE)) return;
    e.preventDefault();
    moveItem(Number(e.dataTransfer.getData(ITEM_DRAG_TYPE)), idx);
  };

  const total = row.querySelector(".itemrow-total");
  row.querySelectorAll("[data-key]").forEach(input => {
    // Enter in a single-line field: go to the next line's first field, or
    // add a new line after the last one. (Enter in the description adds a
    // new text line, as usual.)
    if (input.tagName === "INPUT") {
      input.onkeydown = e => {
        if (e.key !== "Enter" || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        const next = root.children[idx + 1];
        if (next) next.querySelector("[data-key]")?.focus();
        else addLineAndFocus();
      };
    }
    input.oninput = () => {
      const col = state.columns.find(c => c.key === input.dataset.key);
      item[input.dataset.key] = isNumericType(col?.type) ? num(input.value) : input.value;
      // Editing quantity or rate means the line is now quantity x rate again,
      // so an amount kept from an imported statement no longer applies.
      if (col && (col.role === "quantity" || col.role === "rate")) delete item[FIXED_AMOUNT_KEY];
      if (input.tagName === "TEXTAREA") fitTextarea(input);
      total.textContent = lineTotalText(item);
      requestPreview();
      saveInvoice({ typing: true });
    };
  });
  return row;
}

export function initItemControls() {
  // Both add buttons put the cursor straight into the new line.
  $("addItemBtn").onclick = addLineAndFocus;
  if ($("addItemBottomBtn")) $("addItemBottomBtn").onclick = addLineAndFocus;
  $("clearItemsBtn").onclick = async () => {
    if (!state.items.length) return;
    const ok = await confirmAction({
      title: "Remove all line items?",
      message: `All ${state.items.length} line item${state.items.length === 1 ? "" : "s"} will be removed from this invoice. You can bring them back with Undo.`,
      confirmLabel: "Remove all",
      danger: true
    });
    if (!ok) return;
    clearItems();
    renderItems();
    renderPreview();
    saveInvoice();
  };
}
