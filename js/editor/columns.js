/** Column manager: add, rename, retype, resize, align, role, reorder, remove. */

import { $, esc, num, toast } from "../utils.js";
import {
  state, addColumn, removeColumnAt, moveColumn, assignColumnRole, setColumns, defaultColumns
} from "../state.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { renderItems } from "./items.js";
import { saveInvoice } from "../storage/invoice-storage.js";
import { confirmAction } from "../ui/confirm-dialog.js";

/** Private drag type, so drops from outside the column list are ignored. */
const COLUMN_DRAG_TYPE = "application/x-sa-invoice-column";

export function normalizeKey(value) {
  return String(value || "column").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "column";
}

const columnRowMarkup = (col, idx) =>
  `<div class="columnhead"><span class="drag" aria-hidden="true" title="Drag to reorder">\u2630</span><strong>Column ${idx + 1}</strong>` +
  `<label class="tiny"><input class="vis" type="checkbox" ${col.visible ? "checked" : ""}> Show</label>` +
  `<button class="btn icon danger" type="button" aria-label="Remove column ${idx + 1}" title="Remove column">\u00d7</button></div>` +
  `<div class="colgrid">` +
  `<div class="field full"><label for="col-${idx}-labelinput">Heading</label><input id="col-${idx}-labelinput" class="labelinput" value="${esc(col.label)}"></div>` +
  `<div class="field"><label for="col-${idx}-type">Type</label><select id="col-${idx}-type" class="type"><option value="text">Text</option><option value="number">Number</option><option value="currency">Currency</option><option value="percentage">Percentage</option><option value="date">Date</option></select></div>` +
  // num() keeps the width numeric: it is interpolated into markup, so a crafted
  // imported file could otherwise inject HTML through this attribute.
  `<div class="field"><label for="col-${idx}-width">Width %</label><input id="col-${idx}-width" class="width" type="number" min="5" max="80" value="${num(col.width)}"></div>` +
  `<div class="field"><label for="col-${idx}-align">Alignment</label><select id="col-${idx}-align" class="align"><option value="left">Left</option><option value="right">Right</option><option value="center">Centre</option></select></div>` +
  `<div class="field"><label for="col-${idx}-role">Calculation role</label><select id="col-${idx}-role" class="role"><option value="none">None</option><option value="quantity">Quantity</option><option value="rate">Rate</option><option value="amount">Amount</option></select></div>` +
  `</div>`;

export function renderColumns() {
  const root = $("columnEditor");
  root.innerHTML = "";
  state.columns.forEach((col, idx) => {
    const row = document.createElement("div");
    row.className = "columnrow";
    row.draggable = true;
    row.innerHTML = columnRowMarkup(col, idx);

    // Select values are assigned after parsing rather than through markup.
    row.querySelector(".type").value = col.type;
    row.querySelector(".align").value = col.align;
    row.querySelector(".role").value = col.role;

    const sync = () => {
      const previousKey = col.key;
      const newLabel = row.querySelector(".labelinput").value.trim() || "Column";
      col.label = newLabel;
      col.type = row.querySelector(".type").value;
      col.width = num(row.querySelector(".width").value) || 10;
      col.align = row.querySelector(".align").value;
      col.visible = row.querySelector(".vis").checked;
      assignColumnRole(col, row.querySelector(".role").value);

      // Columns created without a key get one derived from the heading.
      if (!previousKey) col.key = normalizeKey(newLabel) + "_" + Date.now();

      renderItems();
      renderPreview();
      saveInvoice();
    };

    row.querySelectorAll("input,select").forEach(el => { el.onchange = sync; });
    row.querySelector(".labelinput").oninput = () => {
      col.label = row.querySelector(".labelinput").value;
      renderPreview();
      saveInvoice({ typing: true });
    };
    row.querySelector("button").onclick = () => {
      if (state.columns.length <= 1) return toast("At least one column is required.");
      removeColumnAt(idx);
      renderColumns();
      renderItems();
      renderPreview();
      saveInvoice();
    };

    row.ondragstart = e => {
      e.dataTransfer.setData(COLUMN_DRAG_TYPE, String(idx));
      e.dataTransfer.setData("text/plain", String(idx));
    };
    row.ondragover = e => e.preventDefault();
    row.ondrop = e => {
      e.preventDefault();
      // Only accept drags that started on a column row. Dropping text or a file
      // here used to be read as index 0 and silently moved the first column.
      if (![...e.dataTransfer.types].includes(COLUMN_DRAG_TYPE)) return;
      const from = Number(e.dataTransfer.getData(COLUMN_DRAG_TYPE));
      if (!Number.isInteger(from) || from < 0 || from >= state.columns.length || from === idx) return;
      moveColumn(from, idx);
      renderColumns();
      renderItems();
      renderPreview();
      saveInvoice();
    };

    root.appendChild(row);
  });
}

export function initColumnControls() {
  $("addColumnBtn").onclick = () => {
    addColumn({
      id: crypto.randomUUID(),
      key: "column_" + Date.now(),
      label: "Column " + (state.columns.length + 1),
      type: "text",
      width: 15,
      align: "left",
      visible: true,
      role: "none"
    });
    renderColumns();
    renderItems();
    renderPreview();
    saveInvoice();
  };
  $("restoreColumnsBtn").onclick = async () => {
    const ok = await confirmAction({
      title: "Restore the default columns?",
      message: "The columns go back to SKU, Description, Qty, Rate and Amount. Values in the line items are kept. You can go back with Undo.",
      confirmLabel: "Restore columns"
    });
    if (!ok) return;
    setColumns(defaultColumns());
    renderColumns();
    renderItems();
    renderPreview();
    saveInvoice();
  };
}
