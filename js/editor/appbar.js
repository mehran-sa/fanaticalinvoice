/**
 * The top bar and the three views: Editor, Invoices (the quarter board) and
 * Settings (the round account button).
 *
 * In the editor the bar shows the academy (with its logo; click to change),
 * the invoice number and its status (click to change), then sync, undo and
 * redo, New invoice and Check and export. The view is kept in the address
 * (#invoices, #settings), so Back and a reload return to it.
 */

import { $, qsa, fieldValue, trimmedField, today } from "../utils.js";
import { STORAGE_KEYS } from "../constants.js";
import { readJSON } from "../storage/local-storage.js";
import { onInvoiceWritten } from "../storage/invoice-storage.js";
import { onDocumentsChange, setInvoiceStatus, onStatusChange } from "../documents.js";
import { effectiveStatus, STATUS_LABELS, periodForDate, shiftPeriod } from "../invoice/periods.js";
import { academyName, academyBadge } from "../academies.js";
import { state } from "../state.js";

const VIEWS = ["editor", "invoices", "settings"];
const viewListeners = new Set();
export const onViewChange = fn => { viewListeners.add(fn); };
export const currentView = () => document.body.dataset.view || "editor";

/**
 * Shows a view.
 * @param {"editor"|"invoices"|"settings"} name
 * @param {{focus?: boolean, push?: boolean, section?: string}} [options]
 */
export function showView(name, { focus = true, push = true, section = "" } = {}) {
  if (!VIEWS.includes(name)) name = "editor";
  const before = currentView();
  document.body.dataset.view = name;
  for (const view of VIEWS) {
    const el = $("view-" + view);
    if (el) el.hidden = view !== name;
  }
  qsa(".appnav-btn").forEach(btn => {
    if (btn.dataset.view === name) btn.setAttribute("aria-current", "page");
    else btn.removeAttribute("aria-current");
  });
  const account = $("accountBtn");
  if (name === "settings") account.setAttribute("aria-current", "page");
  else account.removeAttribute("aria-current");

  const hash = name === "editor" ? "" : "#" + (section && name === "settings" ? section : name);
  if (push && location.hash !== hash && !(hash === "" && !location.hash)) {
    try { history.pushState({ view: name }, "", hash || location.pathname + location.search); } catch { /* file: pages */ }
  }
  viewListeners.forEach(fn => fn(name, before, { section }));
  if (focus && name !== before) {
    const heading = name === "invoices" ? $("boardTitle") : name === "settings" ? $("settingsTitle") : null;
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }
}

/** The view an address asks for: #invoices, #settings or a settings section. */
function viewFromHash() {
  const hash = location.hash.replace(/^#/, "");
  if (hash === "invoices") return { view: "invoices" };
  if (hash === "settings") return { view: "settings" };
  if (hash.startsWith("set-") && $(hash)) return { view: "settings", section: hash };
  return { view: "editor" };
}

/* ------------------------------------------------------------ the bar */

let lastAcademy = null;

export function renderAppBar() {
  const template = fieldValue("template");
  if (template !== lastAcademy) {
    lastAcademy = template;
    $("academyName").textContent = academyName(template);
    $("academyBadge").replaceChildren(academyBadge(template, { size: "s" }));
    $("academyBtn").setAttribute("aria-label", `Brand: ${academyName(template)}. Change it`);
  }
  const number = trimmedField("invoiceNumber");
  $("barNumber").textContent = number ? "Invoice " + number : "Invoice with no number";

  const stored = fieldValue("invoiceStatus") || "draft";
  const shown = effectiveStatus({ status: stored, dueDate: fieldValue("dueDate") }, today());
  const chip = $("statusBtn");
  chip.className = "status-chip " + shown;
  $("statusBtnText").textContent = STATUS_LABELS[shown];
  chip.setAttribute("aria-label", `Status: ${STATUS_LABELS[shown]}${shown === "overdue" ? " (issued, past the due date)" : ""}. Change it`);
  qsa("#statusMenu [data-status]").forEach(item => item.setAttribute("aria-checked", String(item.dataset.status === stored)));
  $("paidDateField").hidden = stored !== "paid";

  const meta = readJSON(STORAGE_KEYS.cloudSync, {}) || {};
  const who = meta.email ? (meta.name || meta.email) : "";
  $("accountInitial").hidden = !who;
  $("accountIcon").style.display = who ? "none" : "";
  $("accountInitial").textContent = who ? who.trim().charAt(0).toUpperCase() : "";
  $("accountBtn").setAttribute("aria-label", who ? `Account and settings (${meta.email})` : "Account and settings");
}

/* ------------------------------------------------------- status menu */

function initStatusMenu() {
  const button = $("statusBtn");
  const menu = $("statusMenu");
  const items = () => [...menu.querySelectorAll(".menu-item")];
  const open = () => {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    (items().find(i => i.getAttribute("aria-checked") === "true") || items()[0]).focus();
  };
  const close = (refocus = false) => {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (refocus) button.focus();
  };
  button.addEventListener("click", () => (menu.hidden ? open() : close()));
  menu.addEventListener("keydown", e => {
    const list = items();
    const i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") close();
  });
  menu.addEventListener("click", e => {
    const item = e.target.closest("[data-status]");
    if (!item) return;
    setInvoiceStatus(state.invoiceId, item.dataset.status);
    close(true);
    renderAppBar();
  });
  document.addEventListener("pointerdown", e => {
    if (!menu.hidden && !menu.contains(e.target) && !button.contains(e.target)) close();
  });
}

/* --------------------------------------------------------------- init */

export function initAppBar({ openPicker }) {
  qsa(".appnav-btn").forEach(btn => { btn.onclick = () => showView(btn.dataset.view); });
  $("accountBtn").onclick = () => showView(currentView() === "settings" ? "editor" : "settings");
  $("academyBtn").onclick = () => openPicker("change");
  $("resetBtn").onclick = () => openPicker("new");
  $("newInvoiceBtn").onclick = () => openPicker("new");
  initStatusMenu();

  // Quarter suggestions: the last four and the current one.
  const current = periodForDate(today());
  $("periodOptions").replaceChildren(...[1, 0, -1, -2, -3].map(n => {
    const option = document.createElement("option");
    option.value = shiftPeriod(current, n);
    return option;
  }));

  // Paid needs a date: today, unless one is set.
  $("invoiceStatus").addEventListener("change", () => {
    if (fieldValue("invoiceStatus") === "paid" && !fieldValue("paidDate")) $("paidDate").value = today();
    if (fieldValue("invoiceStatus") !== "paid") $("paidDate").value = "";
    renderAppBar();
  });

  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(renderAppBar, 120);
  };
  for (const id of ["invoiceNumber", "dueDate", "template"]) {
    $(id)?.addEventListener("input", schedule);
    $(id)?.addEventListener("change", schedule);
  }
  onInvoiceWritten(schedule);
  onDocumentsChange(renderAppBar);
  onStatusChange(renderAppBar);
  window.addEventListener("storage", e => { if (e.key === STORAGE_KEYS.cloudSync) schedule(); });

  // Back and Forward move between views.
  window.addEventListener("popstate", () => {
    const { view, section } = viewFromHash();
    showView(view, { push: false, section });
  });
  const { view, section } = viewFromHash();
  showView(view, { focus: false, push: false, section });
  renderAppBar();
}
