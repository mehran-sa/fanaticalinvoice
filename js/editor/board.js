/**
 * The Invoices view.
 *
 * Quarter board: one row per brand for the chosen quarter, so it is clear at
 * a glance who is not started, in draft or issued. The app does not track
 * payments. Most
 * invoicing tools are built for one seller and many clients; here there are
 * many academies and one main client, so the board is organised by academy.
 * Every Alison academy has a row; other academies have one when they have an
 * invoice in that quarter or the one before. Each row offers one next step:
 * Start, Continue or Open.
 *
 * All invoices: every saved invoice, newest first, with search.
 */

import { $, toast, today } from "../utils.js";
import { STORAGE_KEYS } from "../constants.js";
import { readJSON, writeJSON } from "../storage/local-storage.js";
import { state } from "../state.js";
import { money, dateFmt } from "../invoice/formatters.js";
import { listInvoices } from "../storage/invoice-library.js";
import { onInvoiceWritten } from "../storage/invoice-storage.js";
import {
  openInvoice, deleteInvoice, onDocumentsChange, startInvoiceFor
} from "../documents.js";
import { confirmAction } from "../ui/confirm-dialog.js";
import { listAcademies, academyName, academyBadge } from "../academies.js";
import { effectiveStatus, STATUS_LABELS, comparePeriodsDesc, periodForDate, shiftPeriod } from "../invoice/periods.js";
import { applyTemplateBrand } from "../templates/alison/brand.js";
import { showView, onViewChange, currentView } from "./appbar.js";
import * as TemplateRegistry from "../templates/template-registry.js";

const FILTERS = [["all", "All"], ["notstarted", "Not started"], ["draft", "Draft"], ["issued", "Issued"]];

const readView = () => ({ tab: "quarter", period: "", filter: "all", ...(readJSON(STORAGE_KEYS.boardView, {}) || {}) });
const saveView = patch => writeJSON(STORAGE_KEYS.boardView, { ...readView(), ...patch });

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

const button = (label, className, onClick, ariaLabel = "") => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  if (ariaLabel) b.setAttribute("aria-label", ariaLabel);
  b.onclick = onClick;
  return b;
};

const chip = status => {
  const span = document.createElement("span");
  span.className = "status-chip " + status;
  span.textContent = STATUS_LABELS[status];
  return span;
};

/** The quarters to choose from: every one with an invoice, plus the current and next. */
function periodOptions(all) {
  const current = periodForDate(today());
  const set = new Set(all.map(e => e.period).filter(Boolean));
  set.add(current);
  set.add(shiftPeriod(current, 1));
  return [...set].sort(comparePeriodsDesc);
}

/* ------------------------------------------------------------- board */

function rowsFor(period, all) {
  const t = today();
  const previous = shiftPeriod(period, -1);
  const academies = listAcademies();
  const known = new Map(academies.map(a => [a.id, a]));
  const inPeriod = all.filter(e => e.period === period);
  const ids = new Set(academies.filter(a => a.group === "alison").map(a => a.id));
  for (const e of all) if (e.template && (e.period === period || e.period === previous)) ids.add(e.template);
  const rows = [];
  for (const id of ids) {
    const invoices = inPeriod.filter(e => e.template === id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const academy = known.get(id) || { id, name: academyName(id), group: "general" };
    if (!invoices.length) rows.push({ academy, entry: null, status: "notstarted" });
    for (const entry of invoices) rows.push({ academy, entry, status: effectiveStatus(entry, t) });
  }
  // Invoices with no academy (made before templates named one) still show.
  for (const entry of inPeriod.filter(e => !e.template || !TemplateRegistry.has(e.template))) {
    if (!ids.has(entry.template)) rows.push({ academy: { id: entry.template, name: entry.company || "No template", group: "general" }, entry, status: effectiveStatus(entry, t) });
  }
  const order = { draft: 0, notstarted: 1, issued: 2 };
  return rows.sort((a, b) => order[a.status] - order[b.status] || a.academy.name.localeCompare(b.academy.name));
}

function startFor(id, period) {
  const result = startInvoiceFor(id, { period });
  showView("editor");
  const template = TemplateRegistry.get(id);
  if (result.from) {
    toast(`${template.name} invoice ${result.number} for ${period} started from ${result.from.number}. Check the amounts.`);
  } else if (template?.capabilities?.brand) {
    applyTemplateBrand(template).catch(err => console.error(err));
  } else {
    toast(`New ${template?.name || ""} invoice ${result.number} for ${period} started.`);
  }
}

function open(id) {
  openInvoice(id);
  showView("editor");
}

function boardRow({ academy, entry, status }, period) {
  const row = document.createElement("div");
  row.className = "board-row status-" + status + (entry && entry.id === state.invoiceId ? " current" : "");
  row.setAttribute("role", "listitem");
  row.dataset.academy = academy.id;

  const who = document.createElement("div");
  who.className = "board-academy";
  const names = document.createElement("div");
  names.style.minWidth = "0";
  const name = document.createElement("div");
  name.className = "board-academy-name";
  name.textContent = academy.name;
  const sub = document.createElement("div");
  sub.className = "board-academy-sub";
  sub.textContent = entry ? `Invoice ${entry.number || "with no number"}${entry.client ? ", to " + entry.client : ""}` : "No invoice yet";
  names.append(name, sub);
  who.append(academyBadge(academy.id, { size: "m" }), names);

  const dates = document.createElement("div");
  dates.className = "board-dates";
  if (entry) {
    const parts = [];
    if (entry.invoiceDate) parts.push((status === "draft" ? "Dated " : "Issued ") + dateFmt(entry.invoiceDate));
    if (entry.dueDate) parts.push("due " + dateFmt(entry.dueDate));
    dates.textContent = parts.join(", ");
  } else {
    dates.textContent = "—";
  }

  const amount = document.createElement("div");
  amount.className = "board-amount";
  amount.textContent = entry ? money(entry.total, entry.currency || undefined) : "";

  const statusBox = document.createElement("div");
  statusBox.className = "board-status";
  statusBox.appendChild(chip(status));

  const actions = document.createElement("div");
  actions.className = "board-actions";
  const label = academy.name;
  if (!entry) {
    actions.appendChild(button(`Start ${period}`, "btn small", () => startFor(academy.id, period), `Start ${label}'s ${period} invoice`));
  } else if (status === "draft") {
    actions.appendChild(button("Continue", "btn primary small", () => open(entry.id), `Continue ${label} invoice ${entry.number}`));
  } else {
    actions.appendChild(button("Open", "btn small", () => open(entry.id), `Open ${label} invoice ${entry.number}`));
  }

  row.append(who, dates, amount, statusBox, actions);
  return row;
}

function renderBoard() {
  const all = listInvoices();
  const view = readView();
  const options = periodOptions(all);
  const period = options.includes(view.period) ? view.period : periodForDate(today());
  const select = $("boardPeriod");
  select.replaceChildren(...options.map(p => {
    const o = document.createElement("option");
    o.value = p;
    o.textContent = p;
    return o;
  }));
  select.value = period;

  const rows = rowsFor(period, all);
  const counts = Object.fromEntries(FILTERS.map(([key]) => [key, key === "all" ? rows.length : rows.filter(r => r.status === key).length]));
  const academiesDone = new Set(rows.filter(r => r.entry && r.status !== "draft").map(r => r.academy.id)).size;
  const academiesAll = new Set(rows.map(r => r.academy.id)).size;

  $("boardTitle").textContent = view.tab === "all" ? "All invoices" : `${period} invoices`;
  $("boardSub").textContent = view.tab === "all"
    ? `${plural(all.length, "saved invoice")}, newest first.`
    : `${academiesDone} of ${plural(academiesAll, "brand")} invoiced.`;

  const filter = FILTERS.some(([k]) => k === view.filter) ? view.filter : "all";
  $("boardFilters").replaceChildren(...FILTERS.map(([key, label]) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "filter-chip";
    b.dataset.filter = key;
    b.setAttribute("aria-pressed", String(key === filter));
    b.innerHTML = `<span></span><span class="count"></span>`;
    b.children[0].textContent = label;
    b.children[1].textContent = String(counts[key]);
    b.onclick = () => { saveView({ filter: key }); renderBoard(); };
    return b;
  }));

  const shown = rows.filter(r => filter === "all" || r.status === filter);
  const list = $("boardRows");
  if (!shown.length) {
    const empty = document.createElement("div");
    empty.className = "board-empty";
    empty.textContent = filter === "all" ? `No brands for ${period} yet.` : `No ${STATUS_LABELS[filter].toLowerCase()} invoices for ${period}.`;
    list.replaceChildren(empty);
  } else {
    list.replaceChildren(...shown.map(r => boardRow(r, period)));
  }

  const isAll = view.tab === "all";
  $("boardTabQuarter").setAttribute("aria-selected", String(!isAll));
  $("boardTabAll").setAttribute("aria-selected", String(isAll));
  $("boardTabQuarter").tabIndex = isAll ? -1 : 0;
  $("boardTabAll").tabIndex = isAll ? 0 : -1;
  $("boardQuarter").hidden = isAll;
  $("boardAll").hidden = !isAll;
  $("boardPeriodLabel").hidden = isAll;
  if (isAll) renderInvoiceList();
}

/* ------------------------------------------------------ all invoices */

/** Whether Google Drive sync is on (read directly to avoid an import cycle). */
const isSyncSignedIn = () => Boolean(readJSON(STORAGE_KEYS.cloudSync, {})?.email);

async function confirmDelete(entry) {
  const ok = await confirmAction({
    title: "Delete this invoice?",
    message: `Invoice ${entry.number || "with no number"}${entry.client ? " for " + entry.client : ""} will be deleted from this browser` +
      (isSyncSignedIn() ? " and, through Google Drive sync, from your other devices. " : ". ") +
      "This cannot be undone unless you have a backup or an exported copy.",
    confirmLabel: "Delete invoice",
    danger: true
  });
  if (!ok) return;
  deleteInvoice(entry.id);
  toast("Invoice deleted.");
}

export function renderInvoiceList() {
  const root = $("invoiceList");
  if (!root) return;
  const all = listInvoices();
  const query = ($("invoiceSearch")?.value || "").trim().toLowerCase();
  const t = today();
  const shown = query
    ? all.filter(e => [e.number, e.client, e.period, academyName(e.template), e.company].some(v => String(v || "").toLowerCase().includes(query)))
    : all;

  $("invoiceCount").textContent = `${all.length} saved`;
  root.textContent = "";
  if (!shown.length) {
    const empty = document.createElement("div");
    empty.className = "invoice-empty";
    empty.textContent = all.length
      ? "No saved invoice matches your search."
      : "No saved invoices yet. Your invoice is saved here as soon as you change it.";
    root.appendChild(empty);
    return;
  }

  for (const entry of shown) {
    const current = entry.id === state.invoiceId;
    const status = effectiveStatus(entry, t);
    const row = document.createElement("div");
    row.className = "invoice-row" + (current ? " current" : "");

    const main = document.createElement("div");
    main.className = "invoice-main";
    const number = document.createElement("div");
    number.className = "invoice-number";
    number.textContent = entry.number || "No number";
    const sub = document.createElement("div");
    sub.className = "invoice-sub";
    sub.textContent = [academyName(entry.template), entry.client].filter(Boolean).join(", ");
    main.append(number, sub);

    const meta = document.createElement("div");
    meta.className = "invoice-meta invoice-sub";
    meta.textContent = [entry.period, entry.invoiceDate ? dateFmt(entry.invoiceDate) : ""].filter(Boolean).join(", ");

    const total = document.createElement("div");
    total.className = "invoice-total";
    total.textContent = money(entry.total, entry.currency || "GBP");

    const actions = document.createElement("div");
    actions.className = "invoice-actions";
    if (current) {
      const tag = document.createElement("span");
      tag.className = "invoice-open-now";
      tag.textContent = "Editing";
      actions.appendChild(tag);
      actions.appendChild(button("Show", "btn small", () => showView("editor"), "Show this invoice in the editor"));
    } else {
      actions.appendChild(button("Open", "btn small", () => open(entry.id)));
    }
    actions.appendChild(button("Delete", "btn small danger", () => confirmDelete(entry), "Delete this invoice"));

    row.append(academyBadge(entry.template, { size: "s" }), main, meta, total, chip(status), actions);
    root.appendChild(row);
  }
}

/* ---------------------------------------------------------------- init */

export function initBoard() {
  $("boardPeriod").addEventListener("change", e => { saveView({ period: e.target.value }); renderBoard(); });
  const tabs = [$("boardTabQuarter"), $("boardTabAll")];
  tabs.forEach((tab, i) => {
    tab.onclick = () => { saveView({ tab: i ? "all" : "quarter" }); renderBoard(); };
    tab.onkeydown = e => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const next = tabs[1 - i];
      next.click();
      next.focus();
    };
  });
  $("invoiceSearch").addEventListener("input", renderInvoiceList);

  let pending = null;
  const schedule = () => {
    if (pending || currentView() !== "invoices") return;
    pending = setTimeout(() => { pending = null; renderBoard(); }, 400);
  };
  onDocumentsChange(() => { if (currentView() === "invoices") renderBoard(); });
  onInvoiceWritten(schedule);
  onViewChange(view => { if (view === "invoices") renderBoard(); });
  if (currentView() === "invoices") renderBoard();
}
