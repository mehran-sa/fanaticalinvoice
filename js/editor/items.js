/** Line item editor: the per-item cards in the Items tab. */

import { $, esc, num } from "../utils.js";
import { NUMERIC_COLUMN_TYPES } from "../constants.js";
import { state, editableColumns, addItem, removeItemAt, clearItems, createBlankItem } from "../state.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice } from "../storage/invoice-storage.js";

const isNumericType = type => NUMERIC_COLUMN_TYPES.includes(type);

/** The description column gets a full-width textarea. */
const isDescriptionField = col => col.type === "text" && col.key === "description";
const inputTypeFor = col => (isNumericType(col.type) ? "number" : col.type === "date" ? "date" : "text");

const itemFieldMarkup = (col, item) => {
  const value = esc(item[col.key] ?? "");
  const key = esc(col.key);
  const control = isDescriptionField(col)
    ? `<textarea data-key="${key}">${value}</textarea>`
    : `<input data-key="${key}" type="${inputTypeFor(col)}" step="0.01" value="${value}">`;
  return `<div class="field ${isDescriptionField(col) ? "full" : ""}"><label>${esc(col.label)}</label>${control}</div>`;
};

export function renderItems() {
  const root = $("itemsEditor");
  root.innerHTML = "";
  state.items.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "itemcard";
    const editable = editableColumns();
    card.innerHTML =
      `<div class="itemtop"><strong>Item ${idx + 1}</strong><button class="btn small danger">Remove</button></div>` +
      `<div class="itemgrid">${editable.map(c => itemFieldMarkup(c, item)).join("")}</div>`;

    card.querySelector("button").onclick = () => {
      removeItemAt(idx);
      renderItems();
      renderPreview();
      saveInvoice();
    };
    card.querySelectorAll("[data-key]").forEach(input => {
      input.oninput = () => {
        const col = state.columns.find(c => c.key === input.dataset.key);
        item[input.dataset.key] = isNumericType(col?.type) ? num(input.value) : input.value;
        renderPreview();
        saveInvoice({ typing: true });
      };
    });
    root.appendChild(card);
  });
}

export function initItemControls() {
  $("addItemBtn").onclick = () => {
    addItem(createBlankItem());
    renderItems();
    renderPreview();
    saveInvoice();
  };
  $("clearItemsBtn").onclick = () => {
    if (!confirm("Remove all line items?")) return;
    clearItems();
    renderItems();
    renderPreview();
    saveInvoice();
  };
}
