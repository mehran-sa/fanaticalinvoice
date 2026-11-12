/**
 * Full backup and restore: every saved invoice, logo, client, template and
 * brand in one JSON file.
 *
 * File shape (format "sa-invoice-generator-backup", version 1):
 *   {
 *     format, version, app, exportedAt,
 *     invoices:  [{ id, updatedAt, logoRef, watermarkRef?, summary, data }],
 *     logos:     { logoRef: data URL },
 *     clients:   [...], templates: [...], brands: [...]
 *   }
 *
 * Restoring merges and never deletes:
 *  - an invoice missing here is added; one that exists in both keeps the copy
 *    changed most recently;
 *  - clients, templates and brands are added when nothing with the same name
 *    exists here.
 * Every invoice is validated (js/invoice/snapshot.js) and every logo must be
 * an embedded image, the same rules as a single-invoice import.
 */

import { STORAGE_KEYS, APP_VERSION } from "../constants.js";
import { readRaw, writeRaw } from "./local-storage.js";
import {
  listInvoices, readRecord, readLogos, saveInvoiceRecord, isInvoiceId
} from "./invoice-library.js";
import { listClients, writeClients, cleanClient, clientKey } from "./client-book.js";
import { listTemplates, writeTemplates } from "./template-library.js";
import { listBrands, writeBrands } from "./brand-library.js";
import { normalizeSnapshot, isSafeLogo } from "../invoice/snapshot.js";

export const BACKUP_FORMAT = "sa-invoice-generator-backup";
const nameKey = v => String(v ?? "").trim().toLowerCase();
const isObject = v => v !== null && typeof v === "object" && !Array.isArray(v);

/** Builds the backup object from everything stored on this device. */
export function buildBackup(now = new Date()) {
  const entries = listInvoices();
  const allLogos = readLogos();
  const logos = {};
  const invoices = [];
  for (const entry of entries) {
    const record = readRecord(entry.id);
    if (!record) continue;
    for (const ref of [record.logoRef, record.watermarkRef]) {
      if (ref && allLogos[ref]) logos[ref] = allLogos[ref];
    }
    const { id, ...summary } = entry;
    invoices.push({
      id: record.id || entry.id, updatedAt: record.updatedAt || entry.updatedAt,
      logoRef: record.logoRef || "", watermarkRef: record.watermarkRef || "", summary, data: record.data
    });
  }
  return {
    format: BACKUP_FORMAT,
    version: 1,
    app: "SA Invoice Generator " + APP_VERSION,
    exportedAt: now.toISOString(),
    invoices,
    logos,
    clients: listClients(),
    templates: listTemplates(),
    brands: listBrands()
  };
}

export const backupFileName = (now = new Date()) =>
  `sa-invoice-generator-backup-${now.toISOString().slice(0, 10)}.json`;

export function recordBackupMade(now = new Date()) {
  writeRaw(STORAGE_KEYS.lastBackupAt, now.toISOString());
}

/** When the last full backup was made, or null. */
export function lastBackupAt() {
  const value = readRaw(STORAGE_KEYS.lastBackupAt);
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

/** True when there are invoices and no backup in the last `days` days. */
export function backupIsDue(days, now = new Date()) {
  if (!listInvoices().length) return false;
  const last = lastBackupAt();
  return !last || (now - last) / 864e5 >= days;
}

/**
 * Checks a parsed file and counts what it holds, without changing anything.
 * @throws when the file is not a backup made by this app
 */
export function inspectBackup(data) {
  if (!isObject(data) || data.format !== BACKUP_FORMAT) {
    throw Error("This file is not an SA Invoice Generator backup. Nothing was changed.");
  }
  if (data.version !== 1) throw Error("This backup was made by a newer version of the app and cannot be restored here.");
  const arr = v => (Array.isArray(v) ? v : []);
  return {
    invoices: arr(data.invoices).length,
    clients: arr(data.clients).length,
    templates: arr(data.templates).length,
    brands: arr(data.brands).length,
    exportedAt: typeof data.exportedAt === "string" ? data.exportedAt : ""
  };
}

/**
 * Merges a backup into this device's storage.
 * @returns {{added: number, updated: number, unchanged: number, invalid: number,
 *            clients: number, templates: number, brands: number,
 *            failed: boolean, changedIds: string[]}}
 */
export function restoreBackup(data) {
  inspectBackup(data);
  const result = { added: 0, updated: 0, unchanged: 0, invalid: 0, clients: 0, templates: 0, brands: 0, failed: false, changedIds: [] };
  const local = new Map(listInvoices().map(e => [e.id, e]));
  const logos = isObject(data.logos) ? data.logos : {};

  for (const item of Array.isArray(data.invoices) ? data.invoices : []) {
    if (!isObject(item) || !isInvoiceId(item.id)) { result.invalid++; continue; }
    let snapshot;
    try {
      ({ snapshot } = normalizeSnapshot(item.data));
    } catch {
      result.invalid++;
      continue;
    }
    const updatedAt = typeof item.updatedAt === "string" && !Number.isNaN(new Date(item.updatedAt).getTime())
      ? item.updatedAt : new Date(0).toISOString();
    const existing = local.get(item.id);
    if (existing && existing.updatedAt >= updatedAt) { result.unchanged++; continue; }

    const logo = isSafeLogo(logos[item.logoRef]) ? logos[item.logoRef] : "";
    const watermark = isSafeLogo(logos[item.watermarkRef]) ? logos[item.watermarkRef] : "";
    const s = isObject(item.summary) ? item.summary : {};
    const fields = snapshot.fields || {};
    const summary = {
      number: s.number ?? fields.invoiceNumber ?? "",
      client: s.client ?? String(fields.clientName ?? "").split(/\r?\n/)[0],
      invoiceDate: s.invoiceDate ?? fields.invoiceDate ?? "",
      total: Number(s.total) || 0,
      currency: s.currency ?? fields.currency ?? ""
    };
    if (!saveInvoiceRecord(item.id, { ...snapshot, logo, watermark }, summary, updatedAt).ok) {
      result.failed = true;
      return result;
    }
    if (existing) result.updated++; else result.added++;
    result.changedIds.push(item.id);
  }

  const clients = listClients();
  const clientNames = new Set(clients.map(c => clientKey(c.name)));
  for (const raw of Array.isArray(data.clients) ? data.clients : []) {
    const client = cleanClient(raw);
    if (!client || clientNames.has(clientKey(client.name))) continue;
    clients.push(client);
    clientNames.add(clientKey(client.name));
    result.clients++;
  }
  if (result.clients && !writeClients(clients)) { result.failed = true; return result; }

  const mergeNamed = (incoming, list, write, counter) => {
    const names = new Set(list.map(x => nameKey(x.name)));
    for (const entry of Array.isArray(incoming) ? incoming : []) {
      if (!isObject(entry) || !nameKey(entry.name) || !isObject(entry.data) || names.has(nameKey(entry.name))) continue;
      const copy = JSON.parse(JSON.stringify({ name: String(entry.name).trim(), data: entry.data }));
      // Saved templates and brands carry their own logo copy: same rule.
      if (copy.data.logo && !isSafeLogo(copy.data.logo)) copy.data.logo = "";
      if (copy.data.watermark && !isSafeLogo(copy.data.watermark)) copy.data.watermark = "";
      list.push(copy);
      names.add(nameKey(entry.name));
      result[counter]++;
    }
    if (result[counter] && !write(list)) result.failed = true;
  };
  mergeNamed(data.templates, listTemplates(), writeTemplates, "templates");
  if (result.failed) return result;
  mergeNamed(data.brands, listBrands(), writeBrands, "brands");
  return result;
}
