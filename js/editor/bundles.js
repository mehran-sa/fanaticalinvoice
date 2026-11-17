/**
 * Bundles tab: import a royalty sheet, split the Name column into course and
 * bundle, and either browse the result or push it into the invoice.
 *
 * Two views, matching the standalone tool:
 *   Course + Bundle  - every course grouped under its bundle
 *   Bundle + Price   - one row per bundle, priced at its total royalty
 */

import { $, esc, toast, download } from "../utils.js";
import { confirmAction } from "../ui/confirm-dialog.js";
import { readWorkbookRows } from "../import-export/xlsx.js";
import { parseCSV } from "../import-export/csv.js";
import { extractBundleRows, groupRows, getBundleSummary, getTotalPrice } from "../bundles/bundle-rows.js";
import { buildSplitCSV, buildSummaryCSV, CSV_MIME } from "../bundles/bundle-csv.js";
import { itemsFromRows, itemsFromBundles } from "../bundles/bundle-items.js";
import { setItems } from "../state.js";
import { renderItems } from "./items.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice } from "../storage/invoice-storage.js";
import { compareWithStatement } from "../import-export/statement-total.js";
import { money } from "../invoice/formatters.js";

const VIEWS = { split: "split", summary: "summary" };

/** @type {{rows: Array, view: string, fileBase: string}} */
const view = { rows: [], view: VIEWS.split, fileBase: "bundle_split" };

const setStatus = (text, kind = "") => {
  const el = $("bundleStatus");
  el.className = "bundle-status" + (kind ? " " + kind : "");
  el.textContent = text;
};

/* ----------------------------------------------------------- rendering */

const renderGrouped = rows => {
  const groups = groupRows(rows);
  return [...groups].map(([bundle, items]) => `
    <section class="bundle-group">
      <div class="bundle-group-head">
        <span>${esc(bundle)}</span>
        <span class="bundle-count">${items.length} item${items.length === 1 ? "" : "s"}</span>
      </div>
      <table class="bundle-table">
        <thead><tr><th>Course name</th><th>SKU</th><th class="right">Net qty</th><th class="right">Royalty</th></tr></thead>
        <tbody>
          ${items.map(r => `<tr>
            <td>${esc(r.CourseName)}</td>
            <td>${esc(r.SKU)}</td>
            <td class="right">${esc(r.NetQty)}</td>
            <td class="right">${esc(r.Royalty)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </section>`).join("");
};

const renderSummary = rows => {
  const summary = getBundleSummary(rows);
  const total = getTotalPrice(summary);
  return `
    <section class="bundle-group">
      <div class="bundle-group-head">
        <span>Bundle summary</span>
        <span class="bundle-count">${summary.length} bundle${summary.length === 1 ? "" : "s"}</span>
      </div>
      <table class="bundle-table">
        <thead><tr><th>Bundle name</th><th class="right">Net qty</th><th class="right">Bundle price</th></tr></thead>
        <tbody>
          ${summary.map(r => `<tr>
            <td>${esc(r.Bundle)}</td>
            <td class="right">${esc(r.NetQty)}</td>
            <td class="right">${esc(r.BundlePrice.toFixed(2))}</td>
          </tr>`).join("")}
          <tr class="bundle-total">
            <td><strong>Total price</strong></td>
            <td></td>
            <td class="right"><strong>${esc(total.toFixed(2))}</strong></td>
          </tr>
        </tbody>
      </table>
    </section>`;
};

function render() {
  const results = $("bundleResults");
  if (!view.rows.length) {
    results.innerHTML = "";
    $("bundleTools").classList.add("hidden");
    return;
  }

  results.innerHTML = view.view === VIEWS.summary ? renderSummary(view.rows) : renderGrouped(view.rows);

  const isSummary = view.view === VIEWS.summary;
  $("bundleSummaryViewBtn").classList.toggle("primary", isSummary);
  $("bundleSplitViewBtn").classList.toggle("primary", !isSummary);
  $("applyBundlesBtn").textContent = isSummary
    ? "Apply bundles to invoice"
    : "Apply courses to invoice";

  const groups = groupRows(view.rows);
  $("bundleMeta").textContent =
    `${view.rows.length} row${view.rows.length === 1 ? "" : "s"} · ${groups.size} bundle${groups.size === 1 ? "" : "s"}`;
  $("bundleTools").classList.remove("hidden");
}

/* -------------------------------------------------------------- import */

const isCSV = file => file.name.toLowerCase().endsWith(".csv");

async function handleFile(file) {
  if (!file) return;
  try {
    setStatus("Reading sheet\u2026");
    view.rows = [];
    render();

    const rows = isCSV(file) ? parseCSV(await file.text()) : await readWorkbookRows(file);
    view.rows = extractBundleRows(rows);
    view.fileBase = file.name.replace(/\.(xlsx|xls|csv)$/i, "") || "bundle_split";
    view.view = VIEWS.split;
    render();

    // Check the sheet against its own total row, when it has one.
    const check = compareWithStatement(view.rows.statementTotal, getTotalPrice(getBundleSummary(view.rows)));
    if (check.status === "mismatch") {
      setStatus(`${file.name}: names split and grouped by bundle. The statement's "${check.statement.label}" row says ` +
        `${money(check.statement.value)}, but the rows add up to ${money(check.imported)} (difference ${money(check.difference)}). ` +
        "Check for missing or misread rows.", "error");
    } else if (check.status === "match") {
      setStatus(`${file.name}: names split and grouped by bundle. The rows add up to ${money(check.imported)}, matching the statement's "${check.statement.label}" row.`, "ok");
    } else {
      setStatus(`${file.name} \u2014 names split and grouped by bundle.`, "ok");
    }
  } catch (err) {
    view.rows = [];
    render();
    setStatus(err.message || "Could not read the file.", "error");
  }
}

/* -------------------------------------------------------------- actions */

function downloadCurrentView() {
  if (!view.rows.length) return;
  const summary = view.view === VIEWS.summary;
  download(
    `${view.fileBase}_${summary ? "bundle_price" : "split"}.csv`,
    summary ? buildSummaryCSV(view.rows) : buildSplitCSV(view.rows),
    CSV_MIME
  );
}

/**
 * Explicit apply step: nothing reaches the invoice until the user asks for it
 * and confirms, because this replaces the existing line items.
 */
async function applyToInvoice() {
  if (!view.rows.length) return;

  const summary = view.view === VIEWS.summary;
  const items = summary ? itemsFromBundles(view.rows) : itemsFromRows(view.rows);
  const noun = summary ? "bundle" : "course";

  const ok = await confirmAction({
    title: "Apply to invoice?",
    message: `This replaces the current line items with ${items.length} ${noun}` +
      `${items.length === 1 ? "" : "s"}. Your columns, template and invoice details are not changed.`,
    confirmLabel: "Apply to invoice"
  });
  if (!ok) return;

  setItems(items);
  renderItems();
  renderPreview();
  saveInvoice();
  toast(`${items.length} line item${items.length === 1 ? "" : "s"} applied.`);
}

/* ---------------------------------------------------------------- wiring */

export function initBundleTools() {
  const dropZone = $("bundleDrop");
  const input = $("bundleFile");

  input.onchange = e => {
    handleFile(e.target.files[0]);
    e.target.value = "";
  };

  ["dragenter", "dragover"].forEach(evt => dropZone.addEventListener(evt, e => {
    e.preventDefault();
    dropZone.classList.add("drag");
  }));
  ["dragleave", "drop"].forEach(evt => dropZone.addEventListener(evt, e => {
    e.preventDefault();
    dropZone.classList.remove("drag");
  }));
  dropZone.addEventListener("drop", e => handleFile(e.dataTransfer.files[0]));

  $("bundleSplitViewBtn").onclick = () => { view.view = VIEWS.split; render(); };
  $("bundleSummaryViewBtn").onclick = () => { view.view = VIEWS.summary; render(); };
  $("bundleDownloadBtn").onclick = downloadCurrentView;
  $("applyBundlesBtn").onclick = applyToInvoice;
  $("bundleClearBtn").onclick = () => {
    view.rows = [];
    input.value = "";
    render();
    setStatus("");
  };

  render();
}
