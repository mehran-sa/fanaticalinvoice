/** Column manager: add, rename, retype, resize, align, role, reorder, remove. */

import { $, esc, num, toast } from "../utils.js";
import {
  state, addColumn, removeColumnAt, moveColumn, assignColumnRole, setColumns, defaultColumns
} from "../state.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { renderItems } from "./items.js";
import { saveInvoice } from "../storage/invoice-storage.js";

export function normalizeKey(value) {
  return String(value || "column").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "column";
}

const columnRowMarkup = (col, idx) =>
  `<div class="columnhead"><span class="drag">\u2630</span><strong>Column ${idx + 1}</strong>` +
  `<label class="tiny"><input class="vis" type="checkbox" ${col.visible ? "checked" : ""}> Show</label>` +
  `<button class="btn icon danger">\u00d7</button></div>` +
  `<div class="colgrid">` +
  `<div class="field"><label>Heading</label><input class="labelinput" value="${esc(col.label)}"></div>` +
  `<div class="field"><label>Type</label><select class="type"><option value="text">Text</option><option value="number">Number</option><option value="currency">Currency</option><option value="percentage">Percentage</option><option value="date">Date</option></select></div>` +
  `<div class="field"><label>Width %</label><input class="width" type="number" min="5" max="80" value="${col.width}"></div>` +
  `<div class="field"><label>Alignment</label><select class="align"><option value="left">Left</option><option value="right">Right</option><option value="center">Centre</option></select></div>` +
  `<div class="field"><label>Calculation role</label><select class="role"><option value="none">None</option><option value="quantity">Quantity</option><option value="rate">Rate</option><option value="amount">Amount</option></select></div>` +
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

    row.ondragstart = e => e.dataTransfer.setData("text/plain", idx);
    row.ondragover = e => e.preventDefault();
    row.ondrop = e => {
      e.preventDefault();
      moveColumn(num(e.dataTransfer.getData("text/plain")), idx);
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
  $("restoreColumnsBtn").onclick = () => {
    if (!confirm("Restore the default five columns?")) return;
    setColumns(defaultColumns());
    renderColumns();
    renderItems();
    renderPreview();
    saveInvoice();
  };
}
