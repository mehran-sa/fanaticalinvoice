/**
 * Saved-invoice operations: open, new, duplicate, delete, import as new, and
 * choosing which invoice to show at start-up.
 *
 * The editor always shows one invoice. Switching writes any pending edit of
 * the current invoice first, then applies the other one and starts a fresh
 * undo history for it. Every change is saved to the library automatically by
 * saveInvoice() (js/storage/invoice-storage.js).
 */

import { today, plusDays, isIsoDate, toast, toastError, fieldValue, setFieldValue } from "./utils.js";
import { DEFAULT_DUE_DAYS } from "./constants.js";
import { readSettings } from "./settings-store.js";
import { state, setInvoiceId } from "./state.js";
import { applySnapshot } from "./session.js";
import { serialize, nextInvoiceNumber } from "./invoice/invoice-data.js";
import { flushInvoiceSave, writeInvoiceNow, readInvoiceAutosave, backupUnreadableInvoice } from "./storage/invoice-storage.js";
import {
  listInvoices, loadSavedInvoice, readRecord, deleteInvoiceRecord, newInvoiceId, isInvoiceId, invoicesWithNumber,
  saveInvoiceRecord, summaryDetails
} from "./storage/invoice-library.js";
import { resetHistory } from "./history/invoice-history.js";
import { invoicePeriod, shiftPeriod, rollPeriodText, comparePeriodsDesc, periodForDate } from "./invoice/periods.js";
import { saveInvoice } from "./storage/invoice-storage.js";
import * as TemplateRegistry from "./templates/template-registry.js";

/** Listeners told whenever the open invoice or the list changes. */
const listeners = new Set();
export const onDocumentsChange = fn => { listeners.add(fn); };
export const notifyDocumentsChanged = () => listeners.forEach(fn => fn());

const clone = value => JSON.parse(JSON.stringify(value));

/** App defaults, captured once at start-up before any saved data is applied. */
let blankDefaults = null;
export function captureBlankDefaults() {
  const snapshot = clone(serialize());
  snapshot.items = [];
  snapshot.logo = "";
  delete snapshot.invoiceId;
  blankDefaults = snapshot;
}

/** Applies a snapshot as the open invoice with the given id, and saves it. */
function switchTo(snapshot, id, { save = true } = {}) {
  flushInvoiceSave();
  const warnings = applySnapshot(snapshot, { persist: false });
  setInvoiceId(id);
  if (save) writeInvoiceNow();
  resetHistory();
  notifyDocumentsChanged();
  return warnings;
}

/** Days to pay chosen in Settings, or the app default. */
const defaultDueDays = () => {
  const days = Number(readSettings().defaultDueDays);
  return Number.isInteger(days) && days >= 0 ? days : DEFAULT_DUE_DAYS;
};

/** Today, and a due date that keeps the given invoice's payment term. */
function freshDates(fields) {
  const issued = fields.invoiceDate;
  const due = fields.dueDate;
  const days = isIsoDate(issued) && isIsoDate(due)
    ? Math.round((new Date(due + "T00:00:00") - new Date(issued + "T00:00:00")) / 864e5)
    : defaultDueDays();
  const start = today();
  return { invoiceDate: start, dueDate: plusDays(start, days >= 0 ? days : defaultDueDays()) };
}

/** A new invoice starts as a draft, not paid, for the quarter its lines name. */
function freshStatus(fields) {
  fields.invoiceStatus = "draft";
  fields.paidDate = "";
}

/**
 * The next invoice number after `number` that no saved invoice uses yet.
 * Each academy keeps its own numbers, so with a template only that
 * academy's invoices are checked.
 */
export function nextFreeNumber(number, template) {
  let candidate = nextInvoiceNumber(number);
  for (let i = 0; i < 1000 && invoicesWithNumber(candidate, undefined, template).length; i++) candidate = nextInvoiceNumber(candidate);
  return candidate;
}

const CLIENT_AND_CONTENT_FIELDS = ["clientName", "clientContact", "clientTax", "clientAddress", "clientEmail", "reference", "notes"];

/**
 * Starts a new invoice.
 *  - normally: keeps your company details, design, columns, payment details
 *    and terms; clears the client, reference, notes and line items; uses the
 *    next unused invoice number and today's date with the same payment term;
 *  - blank: the app's original defaults.
 */
export function newInvoice({ blank = false, template = "", quiet = false } = {}) {
  let snapshot;
  if (blank && blankDefaults) {
    snapshot = clone(blankDefaults);
    if (template) snapshot.fields.template = template;
    if (invoicesWithNumber(snapshot.fields.invoiceNumber, undefined, snapshot.fields.template).length) {
      snapshot.fields.invoiceNumber = nextFreeNumber(snapshot.fields.invoiceNumber, snapshot.fields.template);
    }
  } else {
    snapshot = clone(serialize());
    snapshot.items = [];
    for (const id of CLIENT_AND_CONTENT_FIELDS) snapshot.fields[id] = "";
    snapshot.fields.invoiceNumber = nextFreeNumber(snapshot.fields.invoiceNumber, snapshot.fields.template);
  }
  Object.assign(snapshot.fields, freshDates(snapshot.fields));
  freshStatus(snapshot.fields);
  snapshot.fields.invoicePeriod = "";
  snapshot.zoom = state.zoom;
  switchTo(snapshot, newInvoiceId());
  if (!quiet) toast(`New invoice ${snapshot.fields.invoiceNumber} started. The previous one is in your saved invoices.`);
  return snapshot.fields.invoiceNumber;
}

/** Copies the open invoice with the next unused number and today's date. */
export function duplicateInvoice() {
  const snapshot = clone(serialize());
  snapshot.fields.invoiceNumber = nextFreeNumber(snapshot.fields.invoiceNumber, snapshot.fields.template);
  Object.assign(snapshot.fields, freshDates(snapshot.fields));
  freshStatus(snapshot.fields);
  switchTo(snapshot, newInvoiceId());
  toast(`Copy saved as ${snapshot.fields.invoiceNumber}.`);
}

/* ------------------------------------------------- academies and quarters */

/** The academy's most recent invoice: latest quarter, then latest date. */
export function latestInvoiceFor(template, { before = "" } = {}) {
  return listInvoices()
    .filter(e => e.template === template && (!before || comparePeriodsDesc(e.period, before) > 0))
    .sort((a, b) => comparePeriodsDesc(a.period, b.period) || b.invoiceDate.localeCompare(a.invoiceDate) || b.updatedAt.localeCompare(a.updatedAt))[0] || null;
}

/** The academy's invoice for a quarter, if one exists. */
export const invoicesForPeriod = (template, period, exceptId) =>
  listInvoices().filter(e => e.template === template && e.period === period && e.id !== exceptId);

/**
 * Starts an academy's invoice for a quarter.
 *  - With an earlier invoice from that academy: a copy of the latest one,
 *    with the academy's next number, today's date, the same payment term,
 *    and every quarter in its lines, notes and reference changed to the new
 *    one ("Q3-2026 earnings" becomes "Q4-2026 earnings").
 *  - Otherwise a blank invoice in that academy's template; an Alison
 *    template then fills in the academy's details (see templates/alison/brand.js).
 * @param {string} template the academy (template id)
 * @param {{period?: string}} [options] the quarter; default: the one after
 *        the latest invoice, or the quarter before today
 * @returns {{from: object|null, period: string, number: string}}
 */
export function startInvoiceFor(template, { period = "" } = {}) {
  const source = latestInvoiceFor(template, { before: period ? shiftPeriod(period, 1) : "" }) || latestInvoiceFor(template);
  if (source) {
    const snapshot = loadSavedInvoice(source.id);
    if (snapshot) {
      const target = period || shiftPeriod(source.period, 1) || periodForDate(today());
      const roll = text => rollPeriodText(text, target);
      snapshot.items = (snapshot.items || []).map(item => Object.fromEntries(Object.entries(item).map(([k, v]) => [k, roll(v)])));
      for (const id of ["notes", "reference"]) snapshot.fields[id] = roll(snapshot.fields[id] || "");
      snapshot.fields.invoiceNumber = nextFreeNumber(snapshot.fields.invoiceNumber, template);
      Object.assign(snapshot.fields, freshDates(snapshot.fields));
      freshStatus(snapshot.fields);
      snapshot.fields.invoicePeriod = target;
      snapshot.zoom = state.zoom;
      switchTo(snapshot, newInvoiceId());
      return { from: source, period: target, number: snapshot.fields.invoiceNumber };
    }
  }
  const number = newInvoice({ blank: true, template, quiet: true });
  const target = period || periodForDate(today());
  setFieldValue("invoicePeriod", target);
  saveInvoice();
  return { from: null, period: target, number };
}

/**
 * Sets an invoice's status: draft, issued or paid (with today as the paid
 * date). The open invoice is changed in the editor (so Undo works); any
 * other saved invoice is changed where it is stored.
 */
export function setInvoiceStatus(id, status, { paidDate = today() } = {}) {
  if (id === state.invoiceId) {
    setFieldValue("invoiceStatus", status);
    setFieldValue("paidDate", status === "paid" ? (fieldValue("paidDate") || paidDate) : "");
    saveInvoice();
    $statusListeners.forEach(fn => fn());
    notifyDocumentsChanged();
    return true;
  }
  const snapshot = loadSavedInvoice(id);
  const entry = listInvoices().find(e => e.id === id);
  if (!snapshot || !entry) return false;
  snapshot.fields.invoiceStatus = status;
  snapshot.fields.paidDate = status === "paid" ? (snapshot.fields.paidDate || paidDate) : "";
  const { invoiceId, ...data } = snapshot;
  const { id: _id, updatedAt, ...summary } = entry;
  const saved = saveInvoiceRecord(id, data, { ...summary, ...summaryDetails(data) });
  notifyDocumentsChanged();
  return saved.ok;
}

/** Told when the open invoice's status changes from outside the form. */
const $statusListeners = new Set();
export const onStatusChange = fn => { $statusListeners.add(fn); };

/** The academy (template) of the open invoice. */
export const openAcademy = () => fieldValue("template");
export const templateExists = id => TemplateRegistry.has(id);

export function openInvoice(id) {
  if (id === state.invoiceId) return;
  const snapshot = loadSavedInvoice(id);
  if (!snapshot) {
    toastError("That invoice could not be opened. It may have been deleted in another tab.");
    notifyDocumentsChanged();
    return;
  }
  snapshot.zoom = state.zoom;
  try {
    switchTo(snapshot, id, { save: false });
    // Remembered as the invoice to reopen next time, without re-dating it.
    writeInvoiceNow({ record: false });
  } catch (err) {
    console.error("[SA Invoice Generator] invoice could not be opened:", err);
    toastError("That invoice could not be opened. The current invoice was not changed.");
  }
}

/**
 * Deletes a saved invoice. Deleting the open invoice opens the most recently
 * changed remaining one, or a new invoice when none is left.
 */
export function deleteInvoice(id) {
  deleteInvoiceRecord(id);
  if (id === state.invoiceId) {
    const next = listInvoices()[0];
    if (next) {
      const snapshot = loadSavedInvoice(next.id);
      if (snapshot) {
        switchTo({ ...snapshot, zoom: state.zoom }, next.id, { save: false });
        writeInvoiceNow({ record: false });
        return;
      }
    }
    setInvoiceId("");
    newInvoice({ blank: false });
    return;
  }
  notifyDocumentsChanged();
}

/** Opens an imported invoice file as a new saved invoice. */
export function importAsNewInvoice(raw) {
  return switchTo(raw, newInvoiceId());
}

/**
 * Chooses the invoice shown at start-up:
 *  1. the invoice that was open last time, read from the library (the
 *     authoritative copy, which another tab may have changed since);
 *  2. otherwise the working autosave from before 2.2.0, which is added to the
 *     library once (migration);
 *  3. otherwise the most recently changed saved invoice;
 *  4. otherwise the app defaults, saved on the first edit.
 * Nothing is written in cases 1 and 3; see applySnapshot's persist option.
 * @returns {string[]} messages for the user
 */
export function restoreAtStartup() {
  const messages = [];
  const { data, corrupt, backedUp } = readInvoiceAutosave();
  if (corrupt) {
    messages.push(backedUp
      ? "The last open invoice could not be read. A copy was kept in browser storage."
      : "The last open invoice could not be read, and there was no room to keep a copy.");
  }

  const lastId = data && isInvoiceId(data.invoiceId) ? data.invoiceId : null;
  const fromLibrary = lastId && readRecord(lastId) ? loadSavedInvoice(lastId) : null;

  const tryApply = (snapshot, id, save) => {
    try {
      const warnings = applySnapshot(snapshot, { persist: false });
      setInvoiceId(id);
      if (save) writeInvoiceNow();
      if (warnings.length) messages.push("Your invoice was opened with corrections: " + warnings.join(" "));
      return true;
    } catch (err) {
      console.error("[SA Invoice Generator] saved invoice could not be restored:", err);
      return false;
    }
  };

  if (fromLibrary && tryApply(fromLibrary, lastId, false)) return messages;
  if (data && !fromLibrary) {
    if (tryApply(data, lastId || newInvoiceId(), true)) return messages;
    const kept = backupUnreadableInvoice();
    messages.push(kept
      ? "The last open invoice could not be restored. A copy was kept in browser storage."
      : "The last open invoice could not be restored.");
  }
  for (const entry of listInvoices()) {
    const snapshot = loadSavedInvoice(entry.id);
    if (snapshot && tryApply(snapshot, entry.id, false)) return messages;
  }
  setInvoiceId(newInvoiceId());
  return messages;
}
