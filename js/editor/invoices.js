/**
 * Saved tab: the saved-invoices list, new / duplicate / delete, the
 * duplicate-number warning, and full backup and restore.
 */

import { $, toast, download, trimmedField, toastError } from "../utils.js";
import { BACKUP_REMINDER_DAYS, BACKUP_SNOOZE_DAYS, STORAGE_KEYS } from "../constants.js";
import { readRaw, writeRaw } from "../storage/local-storage.js";
import { state } from "../state.js";
import { money, dateFmt } from "../invoice/formatters.js";
import { listInvoices, invoicesWithNumber, loadSavedInvoice } from "../storage/invoice-library.js";
import { flushInvoiceSave, onInvoiceWritten } from "../storage/invoice-storage.js";
import {
  buildBackup, backupFileName, recordBackupMade, lastBackupAt, backupIsDue, inspectBackup, restoreBackup
} from "../storage/backup.js";
import {
  newInvoice, duplicateInvoice, openInvoice, deleteInvoice, onDocumentsChange, notifyDocumentsChanged
} from "../documents.js";
import { applySnapshot } from "../session.js";
import { resetHistory } from "../history/invoice-history.js";
import { confirmAction } from "../ui/confirm-dialog.js";
import { refreshLibraries } from "./library.js";
import { refreshClientPicker } from "./clients.js";

const button = (label, className, onClick, title = "") => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  if (title) b.title = title;
  b.onclick = onClick;
  return b;
};

/* ---------------------------------------------------------------- list */

export function renderInvoiceList() {
  const root = $("invoiceList");
  if (!root) return;
  const all = listInvoices();
  const query = ($("invoiceSearch")?.value || "").trim().toLowerCase();
  const shown = query
    ? all.filter(e => e.number.toLowerCase().includes(query) || e.client.toLowerCase().includes(query))
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
    const row = document.createElement("div");
    row.className = "invoice-row" + (current ? " current" : "");

    const main = document.createElement("div");
    main.className = "invoice-main";
    const number = document.createElement("div");
    number.className = "invoice-number";
    number.textContent = entry.number || "No number";
    const sub = document.createElement("div");
    sub.className = "invoice-sub";
    sub.textContent = [entry.client || "No client", entry.invoiceDate ? dateFmt(entry.invoiceDate) : ""].filter(Boolean).join(", ");
    main.append(number, sub);

    const total = document.createElement("div");
    total.className = "invoice-total";
    total.textContent = money(entry.total, entry.currency || "GBP");

    row.append(main, total);
    if (current) {
      const tag = document.createElement("span");
      tag.className = "invoice-open-now";
      tag.textContent = "Editing";
      row.appendChild(tag);
    } else {
      row.appendChild(button("Open", "btn small", () => openInvoice(entry.id)));
    }
    row.appendChild(button("Delete", "btn small danger", () => confirmDelete(entry), "Delete this invoice"));
    root.appendChild(row);
  }
}

async function confirmDelete(entry) {
  const ok = await confirmAction({
    title: "Delete this invoice?",
    message: `Invoice ${entry.number || "with no number"}${entry.client ? " for " + entry.client : ""} will be deleted from this browser. ` +
      "This cannot be undone unless you have a backup or an exported copy.",
    confirmLabel: "Delete invoice",
    danger: true
  });
  if (!ok) return;
  deleteInvoice(entry.id);
  toast("Invoice deleted.");
}

/* ---------------------------------------------------- number warning */

export function updateNumberWarning() {
  const warning = $("invoiceNumberWarning");
  if (!warning) return;
  const others = invoicesWithNumber(trimmedField("invoiceNumber"), state.invoiceId);
  warning.hidden = !others.length;
  if (others.length) {
    warning.textContent = `Another saved invoice already uses this number${others[0].client ? " (" + others[0].client + ")" : ""}.`;
  }
}

/* -------------------------------------------------------------- backup */

function updateBackupHints() {
  const last = lastBackupAt();
  $("lastBackupHint").textContent = last ? "Last backup: " + dateFmt(last.toISOString().slice(0, 10)) : "No backup yet";
  const snoozedUntil = new Date(readRaw(STORAGE_KEYS.backupReminderSnoozedUntil) || 0);
  const due = backupIsDue(BACKUP_REMINDER_DAYS) && !(snoozedUntil > new Date());
  $("backupReminder").hidden = !due;
  if (due) {
    $("backupReminderText").textContent = last
      ? `Your last full backup was on ${dateFmt(last.toISOString().slice(0, 10))}. Back up regularly: clearing browser data deletes your invoices.`
      : "You have not made a full backup yet. Clearing browser data deletes your invoices.";
  }
}

function backUpEverything() {
  flushInvoiceSave();
  const backup = buildBackup();
  download(backupFileName(), JSON.stringify(backup, null, 1));
  recordBackupMade();
  updateBackupHints();
  toast(`Backup downloaded: ${backup.invoices.length} invoice${backup.invoices.length === 1 ? "" : "s"}. Keep the file somewhere safe, such as another drive.`);
}

async function restoreFromFile(file) {
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toastError(`"${file.name}" is not a backup file. Nothing was changed.`);
  }
  let summary;
  try {
    summary = inspectBackup(data);
  } catch (err) {
    return toastError(err.message);
  }
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const ok = await confirmAction({
    title: "Restore from backup?",
    message: `This backup${summary.exportedAt ? " from " + dateFmt(summary.exportedAt.slice(0, 10)) : ""} holds ` +
      `${plural(summary.invoices, "invoice")}, ${plural(summary.clients, "client")}, ${plural(summary.templates, "template")} ` +
      `and ${plural(summary.brands, "brand")}. They are added to what is here; nothing is deleted. Where the same invoice ` +
      "is in both, the copy changed most recently is kept.",
    confirmLabel: "Restore"
  });
  if (!ok) return;

  flushInvoiceSave();
  const result = restoreBackup(data);

  // If the open invoice was replaced by a newer backup copy, show that copy.
  if (result.changedIds.includes(state.invoiceId)) {
    const snapshot = loadSavedInvoice(state.invoiceId);
    if (snapshot) {
      applySnapshot({ ...snapshot, zoom: state.zoom }, { persist: false });
      resetHistory();
    }
  }
  refreshLibraries();
  refreshClientPicker();
  notifyDocumentsChanged();
  updateBackupHints();

  const parts = [];
  if (result.added) parts.push(`${result.added} invoice${result.added === 1 ? "" : "s"} added`);
  if (result.updated) parts.push(`${result.updated} updated to a newer copy`);
  if (result.clients) parts.push(plural(result.clients, "client") + " added");
  if (result.templates) parts.push(plural(result.templates, "template") + " added");
  if (result.brands) parts.push(plural(result.brands, "brand") + " added");
  if (result.invalid) parts.push(`${result.invalid} damaged invoice${result.invalid === 1 ? " was" : "s were"} skipped`);
  let message = parts.length ? "Restored: " + parts.join(", ") + "." : "Nothing new to restore: everything in the backup is already here.";
  if (result.failed) {
    toastError("The restore stopped because browser storage is full. " + (parts.length ? "Done so far: " + parts.join(", ") + "." : ""));
    return;
  }
  toast(message);
}

/* ---------------------------------------------------------------- init */

export function initInvoiceList() {
  $("newInvoiceBtn").onclick = () => newInvoice();
  $("blankInvoiceBtn").onclick = () => newInvoice({ blank: true });
  $("duplicateInvoiceBtn").onclick = duplicateInvoice;
  $("invoiceSearch").addEventListener("input", renderInvoiceList);

  $("backupBtn").onclick = backUpEverything;
  $("backupNowBtn").onclick = backUpEverything;
  $("backupLaterBtn").onclick = () => {
    writeRaw(STORAGE_KEYS.backupReminderSnoozedUntil, new Date(Date.now() + BACKUP_SNOOZE_DAYS * 864e5).toISOString());
    updateBackupHints();
    toast(`You will be reminded again in ${BACKUP_SNOOZE_DAYS} days.`);
  };

  // The privacy note can be hidden for good; the save indicator's tooltip and
  // the README say the same thing.
  const note = $("privacyNotice");
  if (note) {
    note.hidden = readRaw(STORAGE_KEYS.privacyNoticeHidden) === "1";
    $("privacyNoticeClose").onclick = () => {
      writeRaw(STORAGE_KEYS.privacyNoticeHidden, "1");
      note.hidden = true;
    };
  }
  $("restoreBtn").onclick = () => $("restoreFile").click();
  $("restoreFile").onchange = e => {
    const file = e.target.files[0];
    e.target.value = "";
    restoreFromFile(file);
  };

  $("invoiceNumber").addEventListener("input", updateNumberWarning);

  // The list follows every save (totals, numbers and clients change as you
  // type), redrawn at most a few times a second.
  let pending = null;
  const scheduleRender = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      renderInvoiceList();
      updateNumberWarning();
    }, 400);
  };
  onDocumentsChange(() => {
    renderInvoiceList();
    updateNumberWarning();
    updateBackupHints();
    refreshClientPicker();
  });
  onInvoiceWritten(scheduleRender);

  renderInvoiceList();
  updateNumberWarning();
  updateBackupHints();
}
