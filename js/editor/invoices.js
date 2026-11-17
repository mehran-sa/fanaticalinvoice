/**
 * New / duplicate, the duplicate-number warning, and full backup and restore
 * (Settings > Backups). The saved-invoices list is on the Invoices view
 * (js/editor/board.js).
 */

import { $, toast, download, trimmedField, toastError } from "../utils.js";
import { BACKUP_REMINDER_DAYS, BACKUP_SNOOZE_DAYS, STORAGE_KEYS } from "../constants.js";
import { readRaw, writeRaw, readJSON } from "../storage/local-storage.js";
import { state } from "../state.js";
import { money, dateFmt } from "../invoice/formatters.js";
import { invoicesWithNumber, loadSavedInvoice } from "../storage/invoice-library.js";
import { academyName } from "../academies.js";
import { flushInvoiceSave, onInvoiceWritten } from "../storage/invoice-storage.js";
import {
  buildBackup, backupFileName, recordBackupMade, lastBackupAt, backupIsDue, inspectBackup, restoreBackup
} from "../storage/backup.js";
import { newInvoice, duplicateInvoice, onDocumentsChange, notifyDocumentsChanged } from "../documents.js";
import { applySnapshot } from "../session.js";
import { resetHistory } from "../history/invoice-history.js";
import { confirmAction } from "../ui/confirm-dialog.js";
import { refreshLibraries } from "./library.js";
import { refreshClientPicker } from "./clients.js";

/* ---------------------------------------------------- number warning */

export function updateNumberWarning() {
  const warning = $("invoiceNumberWarning");
  if (!warning) return;
  const template = $("template").value;
  const others = invoicesWithNumber(trimmedField("invoiceNumber"), state.invoiceId, template);
  warning.hidden = !others.length;
  if (others.length) {
    warning.textContent = `Another ${academyName(template)} invoice already uses this number${others[0].period ? " (" + others[0].period + ")" : others[0].client ? " (" + others[0].client + ")" : ""}.`;
  }
}

/* -------------------------------------------------------------- backup */

function updateBackupHints() {
  const last = lastBackupAt();
  $("lastBackupHint").textContent = last ? "Last file backup: " + dateFmt(last.toISOString().slice(0, 10)) + "." : "No backup file made yet.";
  const snoozedUntil = new Date(readRaw(STORAGE_KEYS.backupReminderSnoozedUntil) || 0);
  // A recent backup in Google Drive counts: no need to nag for a file too.
  const driveAt = new Date(readJSON(STORAGE_KEYS.cloudSync, {})?.lastDriveBackupAt || 0);
  const driveRecent = Date.now() - driveAt.getTime() < BACKUP_REMINDER_DAYS * 864e5;
  const due = backupIsDue(BACKUP_REMINDER_DAYS) && !(snoozedUntil > new Date()) && !driveRecent;
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
  return restoreFromData(data);
}

/**
 * Restores a backup (a file, or one from the Google Drive Backups folder)
 * after the user confirms. Nothing already here is deleted.
 * @returns {Promise<boolean>} whether it was restored
 */
export async function restoreFromData(data, { from = "" } = {}) {
  let summary;
  try {
    summary = inspectBackup(data);
  } catch (err) {
    return toastError(err.message);
  }
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const ok = await confirmAction({
    title: "Restore from backup?",
    message: `This backup${from ? " " + from : summary.exportedAt ? " from " + dateFmt(summary.exportedAt.slice(0, 10)) : ""} holds ` +
      `${plural(summary.invoices, "invoice")}, ${plural(summary.clients, "client")}, ${plural(summary.templates, "template")} ` +
      `and ${plural(summary.brands, "brand")}. They are added to what is here; nothing is deleted. Where the same invoice ` +
      "is in both, the copy changed most recently is kept.",
    confirmLabel: "Restore"
  });
  if (!ok) return false;

  flushInvoiceSave();
  const result = restoreBackup(data, { revive: true });

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
    return false;
  }
  toast(message);
  return true;
}

/* ---------------------------------------------------------------- init */

export function initInvoiceList() {
  $("blankInvoiceBtn").onclick = () => newInvoice({ blank: true });
  $("duplicateInvoiceBtn").onclick = duplicateInvoice;

  $("backupBtn").onclick = backUpEverything;
  $("backupNowBtn").onclick = backUpEverything;
  $("backupLaterBtn").onclick = () => {
    writeRaw(STORAGE_KEYS.backupReminderSnoozedUntil, new Date(Date.now() + BACKUP_SNOOZE_DAYS * 864e5).toISOString());
    updateBackupHints();
    toast(`You will be reminded again in ${BACKUP_SNOOZE_DAYS} days.`);
  };

  $("restoreBtn").onclick = () => $("restoreFile").click();
  $("restoreFile").onchange = e => {
    const file = e.target.files[0];
    e.target.value = "";
    restoreFromFile(file);
  };

  $("invoiceNumber").addEventListener("input", updateNumberWarning);
  $("template").addEventListener("change", updateNumberWarning);

  // The list follows every save (totals, numbers and clients change as you
  // type), redrawn at most a few times a second.
  let pending = null;
  const scheduleRender = () => {
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      updateNumberWarning();
    }, 400);
  };
  onDocumentsChange(() => {
    updateNumberWarning();
    updateBackupHints();
    refreshClientPicker();
  });
  onInvoiceWritten(scheduleRender);

  updateNumberWarning();
  updateBackupHints();
}
