/**
 * Line items as a compact table: one row per line, a box per column, the line
 * total, and small controls to reorder or remove.
 *
 *  - The boxes follow the invoice's design. An Alison template that prints
 *    only Description and Amount gets just those two; the Amount box then
 *    sets the line to quantity 1 at that amount. Other designs get
 *    Description, Qty and Rate (and any other shown column), with the line
 *    total worked out.
 *  - Tab moves across a row. Enter goes down to the same box on the next
 *    line, or adds a line after the last one (as in a spreadsheet); Shift or
 *    Alt + Enter starts a new text line in a description.
 *  - Rows copied in Excel or Google Sheets can be pasted into a description,
 *    or into the "Paste from Excel" box, to add them all at once.
 * Reorder by dragging the handle, or with the Up/Down buttons (keyboard).
 */

import { $, esc, num, fieldValue, toast } from "../utils.js";
import { calculateItemTotal, amountColumn, getTotals } from "../invoice/calculations.js";
import { money } from "../invoice/formatters.js";
import { NUMERIC_COLUMN_TYPES, FIXED_AMOUNT_KEY } from "../constants.js";
import { state, editableColumns, roleCol, addItem, removeItemAt, clearItems, createBlankItem, setItems } from "../state.js";
import { renderPreview, requestPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice } from "../storage/invoice-storage.js";
import { confirmAction } from "../ui/confirm-dialog.js";
import { roundMoney } from "../utils.js";
import { parsePastedRows, looksLikeCells } from "../import-export/paste-rows.js";
import { amountOnlyLines } from "../academies.js";
import * as TemplateRegistry from "../templates/template-registry.js";

const isNumericType = type => NUMERIC_COLUMN_TYPES.includes(type);
const isDescriptionField = col => col.type === "text" && col.key === "description";
const inputTypeFor = col => (isNumericType(col.type) ? "number" : col.type === "date" ? "date" : "text");

/** The box that sets a whole line's amount (Description and Amount designs). */
const AMOUNT_FIELD = { key: "$amount", label: "Amount", type: "currency", role: "amount-input" };

/** Description first, then quantity, rate, then the rest in column order. */
const fieldRank = col => (isDescriptionField(col) ? 0 : col.role === "quantity" ? 1 : col.role === "rate" ? 2 : 3);
const orderedFields = cols => cols.map((c, i) => [c, i]).sort((a, b) => fieldRank(a[0]) - fieldRank(b[0]) || a[1] - b[1]).map(([c]) => c);

/** The text column lines are described in. */
const descriptionColumn = () =>
  state.columns.find(isDescriptionField) || state.columns.find(c => c.type === "text" && c.role === "none");

/**
 * What the table shows for the current design.
 * @returns {{fields: object[], amountOnly: boolean}}
 */
export function itemLayout() {
  const template = TemplateRegistry.get(fieldValue("template"));
  const desc = descriptionColumn();
  if (amountOnlyLines(template?.id) && desc) return { fields: [desc, AMOUNT_FIELD], amountOnly: true };
  const dropSku = template?.capabilities?.dropSkuWhenDescription && state.columns.some(isDescriptionField);
  const fields = orderedFields(editableColumns().filter(c => c.visible !== false && !(dropSku && c.key === "sku" && c.role === "none")));
  return { fields: fields.length ? fields : orderedFields(editableColumns()), amountOnly: false };
}

const widthFor = field => {
  if (field === AMOUNT_FIELD) return "104px";
  if (isDescriptionField(field)) return "minmax(0,1fr)";
  if (field.role === "quantity") return "56px";
  if (isNumericType(field.type)) return "84px";
  if (field.type === "date") return "132px";
  return "minmax(0,.5fr)";
};

/** The grid every row and the heading share. */
function applyGrid(layout) {
  const cols = ["14px", ...layout.fields.map(widthFor)];
  if (!layout.amountOnly) cols.push("minmax(72px,auto)");
  cols.push("50px");
  $("itemsTable")?.style.setProperty("--item-cols", cols.join(" "));
  const head = $("itemsHead");
  if (head) {
    const cells = ["<span></span>", ...layout.fields.map(f => `<span class="${isNumericType(f.type) ? "num" : ""}">${esc(f.label)}</span>`)];
    if (!layout.amountOnly) cells.push(`<span class="num">${esc(amountColumn().label || "Amount")}</span>`);
    cells.push("<span></span>");
    head.innerHTML = cells.join("");
  }
}

const amountInputValue = item => {
  const total = calculateItemTotal(item, amountColumn());
  return total ? String(total) : "";
};

/** Sets a line to quantity 1 at this amount (Description and Amount designs). */
function setLineAmount(item, value) {
  const q = roleCol("quantity");
  const r = roleCol("rate");
  const a = roleCol("amount");
  delete item[FIXED_AMOUNT_KEY];
  if (q && r) {
    item[q.key] = 1;
    item[r.key] = value;
  } else if (a && !q && !r) {
    item[a.key] = value;
  } else {
    item[FIXED_AMOUNT_KEY] = value;
  }
}

/** The field id is built from positions, never from user text, so it is always valid. */
const itemFieldMarkup = (col, item, itemIndex, colIndex) => {
  const id = `item-${itemIndex}-field-${colIndex}`;
  const key = esc(col.key);
  const label = `<label for="${id}">${esc(col.label)}</label>`;
  if (col === AMOUNT_FIELD) {
    return `<div class="field amount">${label}<input id="${id}" data-key="${key}" type="number" step="0.01" inputmode="decimal" value="${esc(amountInputValue(item))}"></div>`;
  }
  const value = esc(item[col.key] ?? "");
  const control = isDescriptionField(col)
    ? `<textarea id="${id}" data-key="${key}" rows="1">${value}</textarea>`
    : `<input id="${id}" data-key="${key}" type="${inputTypeFor(col)}" step="0.01"${isNumericType(col.type) ? ' inputmode="decimal"' : ""} value="${value}">`;
  return `<div class="field ${isDescriptionField(col) ? "desc" : ""}">${label}${control}</div>`;
};

const lineTotalText = item => money(calculateItemTotal(item, amountColumn()));

/**
 * Grows a description box to fit its text. Browsers that support CSS
 * field-sizing do this by themselves, with no measuring at all.
 */
const AUTO_SIZED = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");
const fitTextarea = el => {
  if (AUTO_SIZED) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + 2 + "px";
};
/** All writes, then all reads, then all writes: one layout for many boxes. */
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

/** Adds a blank line and puts the cursor in it (in the given box, or the first). */
function addLineAndFocus(fieldIndex = 0) {
  addItem(createBlankItem());
  appendLastItemRow();
  renderPreview();
  saveInvoice();
  const rows = $("itemsEditor").children;
  const boxes = rows[rows.length - 1]?.querySelectorAll("[data-key]") || [];
  (boxes[fieldIndex] || boxes[0])?.focus();
}

let currentLayout = null;

export function renderItems() {
  const root = $("itemsEditor");
  if (!root) return;
  currentLayout = itemLayout();
  applyGrid(currentLayout);
  const fragment = document.createDocumentFragment();
  state.items.forEach((item, idx) => fragment.appendChild(createItemRow(item, idx, currentLayout)));
  root.replaceChildren(fragment);
  const boxes = [...root.querySelectorAll("textarea[data-key]")];
  requestAnimationFrame(() => fitTextareas(boxes));
}

/** Adds the row for the last item without rebuilding the others. */
function appendLastItemRow() {
  const root = $("itemsEditor");
  const idx = state.items.length - 1;
  if (idx < 0 || root.children.length !== idx || !currentLayout) {
    renderItems();
    return;
  }
  const above = root.children[idx - 1]?.querySelector(".move-down");
  if (above) above.disabled = false;
  const row = createItemRow(state.items[idx], idx, currentLayout);
  root.appendChild(row);
  fitTextareas([...row.querySelectorAll("textarea[data-key]")]);
}

/* ------------------------------------------------------------- pasting */

/** Line items from pasted rows, in the current columns. */
function itemsFromRows(rows) {
  const desc = descriptionColumn();
  const q = roleCol("quantity");
  const r = roleCol("rate");
  return rows.map(row => {
    const item = createBlankItem();
    if (desc) item[desc.key] = row.description;
    const amount = row.amount ?? 0;
    if (q && r) {
      const quantity = row.quantity ?? 1;
      const rate = row.rate ?? (quantity ? amount / quantity : amount);
      item[q.key] = quantity;
      item[r.key] = Math.round(rate * 1e4) / 1e4;
      if (row.amount !== null && roundMoney(quantity * item[r.key]) !== roundMoney(amount)) item[FIXED_AMOUNT_KEY] = roundMoney(amount);
    } else {
      setLineAmount(item, amount);
    }
    return item;
  });
}

/**
 * Adds pasted rows as lines.
 * @param {string} text the pasted cells
 * @param {{at?: number, replace?: boolean}} options at: the line they go
 *        in place of (an empty line is replaced, otherwise they go after it)
 * @returns {number} lines added
 */
export function addPastedRows(text, { at = -1, replace = false } = {}) {
  const rows = parsePastedRows(text);
  if (!rows.length) return 0;
  const items = itemsFromRows(rows);
  if (replace) setItems(items);
  else if (at >= 0 && at < state.items.length) {
    const target = state.items[at];
    const empty = Object.entries(target).every(([k, v]) => k === roleCol("quantity")?.key || v === "" || v === 0 || v === undefined);
    state.items.splice(empty ? at : at + 1, empty ? 1 : 0, ...items);
  } else {
    items.forEach(addItem);
  }
  renderItems();
  renderPreview();
  saveInvoice();
  toast(`${rows.length} line${rows.length === 1 ? "" : "s"} added from the pasted rows. Total ${money(getTotals().total)}.`);
  return rows.length;
}

/* ----------------------------------------------------------------- rows */

function focusBox(rowIndex, fieldIndex) {
  const row = $("itemsEditor").children[rowIndex];
  const boxes = row?.querySelectorAll("[data-key]") || [];
  const box = boxes[fieldIndex] || boxes[0];
  box?.focus();
  return Boolean(box);
}

function createItemRow(item, idx, layout) {
  const root = $("itemsEditor");
  const row = document.createElement("div");
  row.className = "itemrow";
  row.dataset.index = String(idx);
  const n = idx + 1;
  const last = () => state.items.length - 1;
  row.innerHTML =
    `<span class="drag" title="Drag to reorder" aria-hidden="true">☰</span>` +
    layout.fields.map((c, ci) => itemFieldMarkup(c, item, idx, ci)).join("") +
    (layout.amountOnly ? "" : `<span class="itemrow-total" aria-label="Line ${n} total">${lineTotalText(item)}</span>`) +
    `<span class="itemrow-actions">` +
      `<button class="btn icon move-up" type="button" aria-label="Move line ${n} up" title="Move up"${idx === 0 ? " disabled" : ""}>↑</button>` +
      `<button class="btn icon move-down" type="button" aria-label="Move line ${n} down" title="Move down"${idx === last() ? " disabled" : ""}>↓</button>` +
      `<button class="btn icon danger remove" type="button" aria-label="Remove line ${n}" title="Remove line">×</button>` +
    `</span>`;

  row.querySelector(".remove").onclick = () => {
    removeItemAt(idx);
    renderItems();
    renderPreview();
    saveInvoice();
    focusBox(Math.min(idx, state.items.length - 1), 0) || $("addItemBtn")?.focus();
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
  const boxes = [...row.querySelectorAll("[data-key]")];
  boxes.forEach((input, fieldIndex) => {
    input.onkeydown = e => {
      if (e.key !== "Enter" || e.ctrlKey || e.metaKey) return;
      // A new text line inside a description: Shift or Alt + Enter.
      if (input.tagName === "TEXTAREA" && (e.shiftKey || e.altKey)) return;
      if (e.shiftKey || e.altKey) return;
      e.preventDefault();
      if (!focusBox(idx + 1, fieldIndex)) addLineAndFocus(0);
    };
    if (input.tagName === "TEXTAREA") {
      input.addEventListener("paste", e => {
        const text = e.clipboardData?.getData("text/plain") || "";
        if (!looksLikeCells(text)) return;
        e.preventDefault();
        addPastedRows(text, { at: idx });
      });
    }
    input.oninput = () => {
      if (input.dataset.key === AMOUNT_FIELD.key) {
        setLineAmount(item, num(input.value));
      } else {
        const col = state.columns.find(c => c.key === input.dataset.key);
        item[input.dataset.key] = isNumericType(col?.type) ? num(input.value) : input.value;
        // Editing quantity or rate means the line is quantity x rate again,
        // so an amount kept from an imported statement no longer applies.
        if (col && (col.role === "quantity" || col.role === "rate")) delete item[FIXED_AMOUNT_KEY];
      }
      if (input.tagName === "TEXTAREA") fitTextarea(input);
      if (total) total.textContent = lineTotalText(item);
      requestPreview();
      saveInvoice({ typing: true });
    };
  });
  return row;
}

/** Private drag type, so drops from outside the item list are ignored. */
const ITEM_DRAG_TYPE = "application/x-sa-invoice-item";

export function initItemControls() {
  $("addItemBtn").onclick = () => addLineAndFocus(0);
  if ($("addItemBottomBtn")) $("addItemBottomBtn").onclick = () => addLineAndFocus(0);
  $("clearItemsBtn").onclick = async () => {
    if (!state.items.length) return;
    const ok = await confirmAction({
      title: "Remove all lines?",
      message: `All ${state.items.length} line${state.items.length === 1 ? "" : "s"} will be removed from this invoice. You can bring them back with Undo.`,
      confirmLabel: "Remove all",
      danger: true
    });
    if (!ok) return;
    clearItems();
    renderItems();
    renderPreview();
    saveInvoice();
  };

  // The paste box, for rows copied from a spreadsheet.
  const box = $("pasteBox");
  const toggleBox = open => {
    box.hidden = !open;
    $("pasteItemsBtn").setAttribute("aria-expanded", String(open));
    if (open) $("pasteArea").focus();
  };
  $("pasteItemsBtn").onclick = () => toggleBox(box.hidden);
  $("pasteCancelBtn").onclick = () => { $("pasteArea").value = ""; toggleBox(false); $("pasteItemsBtn").focus(); };
  const take = replace => {
    const text = $("pasteArea").value;
    if (!parsePastedRows(text).length) {
      toast("Paste the rows first: copy them in Excel or Google Sheets, then press Ctrl+V (Cmd+V on a Mac) in the box.");
      $("pasteArea").focus();
      return;
    }
    addPastedRows(text, { replace });
    $("pasteArea").value = "";
    toggleBox(false);
  };
  $("pasteAddBtn").onclick = () => take(false);
  $("pasteReplaceBtn").onclick = () => take(true);

  // The boxes change with the design (Description and Amount, or Qty and Rate).
  $("template")?.addEventListener("change", renderItems);
}
