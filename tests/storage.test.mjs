/**
 * Tests for saved invoices, shared logos, backup/restore, the client book and
 * statement totals. A small in-memory stand-in replaces the browser's
 * localStorage, so no packages are needed:
 *
 *     node --test tests/storage.test.mjs
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
  clear: () => store.clear()
};

const lib = await import("../js/storage/invoice-library.js");
const backup = await import("../js/storage/backup.js");
const clients = await import("../js/storage/client-book.js");
const { findStatementTotal } = await import("../js/import-export/statement-total.js");
const { readStatementRows } = await import("../js/import-export/row-mapper.js");
const { parseCSV } = await import("../js/import-export/csv.js");
const { setColumns, defaultColumns } = await import("../js/state.js");
const { STORAGE_KEYS } = await import("../js/constants.js");

const LOGO = "data:image/png;base64,AAAA";
const snap = (number, logo = LOGO) => ({
  version: 2, logo, zoom: 1, columns: defaultColumns(),
  items: [{ sku: "A", description: "Line", quantity: 2, rate: 10 }],
  sections: {}, fields: { invoiceNumber: number, clientName: "Client " + number, currency: "GBP" }
});
const summary = number => ({ number, client: "Client " + number, invoiceDate: "2026-10-15", total: 20, currency: "GBP" });

beforeEach(() => store.clear());

/* ------------------------------------------------------- invoice library */

test("saved invoices share one stored copy of the same logo", () => {
  lib.saveInvoiceRecord("a1", snap("INV-1"), summary("INV-1"));
  lib.saveInvoiceRecord("b2", snap("INV-2"), summary("INV-2"));
  assert.equal(Object.keys(lib.readLogos()).length, 1);
  assert.equal(lib.listInvoices().length, 2);
  assert.equal(lib.loadSavedInvoice("a1").logo, LOGO);
  assert.equal(lib.loadSavedInvoice("b2").fields.invoiceNumber, "INV-2");
  // The record itself does not contain the image.
  assert.ok(!store.get(STORAGE_KEYS.invoiceRecordPrefix + "a1").includes("base64,AAAA"));
});

test("deleting invoices removes a logo only when nothing uses it", () => {
  lib.saveInvoiceRecord("a1", snap("INV-1"), summary("INV-1"));
  lib.saveInvoiceRecord("b2", snap("INV-2"), summary("INV-2"));
  lib.deleteInvoiceRecord("a1");
  assert.equal(Object.keys(lib.readLogos()).length, 1);
  lib.deleteInvoiceRecord("b2");
  assert.equal(Object.keys(lib.readLogos()).length, 0);
  assert.equal(lib.listInvoices().length, 0);
});

test("duplicate invoice numbers are found case-insensitively, excluding the invoice itself", () => {
  lib.saveInvoiceRecord("a1", snap("INV-1"), summary("INV-1"));
  assert.equal(lib.invoicesWithNumber(" inv-1 ", "zz").length, 1);
  assert.equal(lib.invoicesWithNumber("INV-1", "a1").length, 0);
  assert.equal(lib.invoicesWithNumber("", "zz").length, 0);
});

test("unsafe ids are refused", () => {
  assert.equal(lib.saveInvoiceRecord("../x", snap("X"), summary("X")).ok, false);
  assert.equal(lib.loadSavedInvoice("__proto__"), null);
});

/* --------------------------------------------------------------- backup */

test("a backup restores every invoice, logo, client, template and brand on an empty device", () => {
  lib.saveInvoiceRecord("a1", snap("INV-1"), summary("INV-1"));
  clients.saveClient({ name: "Acme", address: "1 High St" });
  localStorage.setItem(STORAGE_KEYS.templates, JSON.stringify([{ name: "Monthly", data: snap("T") }]));
  localStorage.setItem(STORAGE_KEYS.brands, JSON.stringify([{ name: "Brand", data: { fields: {} } }]));
  const file = JSON.parse(JSON.stringify(backup.buildBackup()));

  store.clear();
  const result = backup.restoreBackup(file);
  assert.deepEqual([result.added, result.clients, result.templates, result.brands, result.failed], [1, 1, 1, 1, false]);
  assert.equal(lib.loadSavedInvoice("a1").logo, LOGO);
  assert.equal(lib.loadSavedInvoice("a1").items[0].rate, 10);

  const again = backup.restoreBackup(file);
  assert.deepEqual([again.added, again.updated, again.unchanged, again.clients], [0, 0, 1, 0]);
});

test("restore keeps whichever copy of an invoice was changed most recently", () => {
  lib.saveInvoiceRecord("a1", snap("OLD"), summary("OLD"), "2026-01-01T00:00:00.000Z");
  const file = JSON.parse(JSON.stringify(backup.buildBackup()));
  lib.saveInvoiceRecord("a1", snap("NEWER-HERE"), summary("NEWER-HERE"), "2026-06-01T00:00:00.000Z");
  assert.equal(backup.restoreBackup(file).unchanged, 1);
  assert.equal(lib.loadSavedInvoice("a1").fields.invoiceNumber, "NEWER-HERE");

  file.invoices[0].updatedAt = "2026-09-01T00:00:00.000Z";
  assert.equal(backup.restoreBackup(file).updated, 1);
  assert.equal(lib.loadSavedInvoice("a1").fields.invoiceNumber, "OLD");
});

test("restore drops remote logos and skips damaged invoices; other files are refused", () => {
  const file = {
    format: backup.BACKUP_FORMAT, version: 1,
    invoices: [
      { id: "ok1", updatedAt: "2026-01-01T00:00:00Z", logoRef: "x", data: snap("A", "") },
      { id: "bad", data: "not an invoice" },
      { id: "../evil", data: snap("B", "") }
    ],
    logos: { x: "https://example.com/track.png" }
  };
  const result = backup.restoreBackup(file);
  assert.deepEqual([result.added, result.invalid], [1, 2]);
  assert.equal(lib.loadSavedInvoice("ok1").logo, "");
  assert.throws(() => backup.inspectBackup({ name: "package.json" }));
  assert.throws(() => backup.inspectBackup({ format: backup.BACKUP_FORMAT, version: 2 }));
});

test("backup reminder: due with invoices and no recent backup", () => {
  assert.equal(backup.backupIsDue(30), false);
  lib.saveInvoiceRecord("a1", snap("INV-1"), summary("INV-1"));
  assert.equal(backup.backupIsDue(30), true);
  backup.recordBackupMade(new Date());
  assert.equal(backup.backupIsDue(30), false);
  assert.equal(backup.backupIsDue(30, new Date(Date.now() + 31 * 864e5)), true);
});

/* ---------------------------------------------------------- client book */

test("clients are saved, updated by name and removed", () => {
  assert.equal(clients.saveClient({ name: "  " }).ok, false);
  assert.deepEqual(clients.saveClient({ name: "Acme Ltd", email: "a@x" }), { ok: true, updated: false });
  assert.deepEqual(clients.saveClient({ name: "acme ltd ", email: "b@x" }), { ok: true, updated: true });
  const list = clients.listClients();
  assert.equal(list.length, 1);
  assert.equal(list[0].email, "b@x");
  clients.removeClient(list[0].id);
  assert.equal(clients.listClients().length, 0);
});

/* ---------------------------------------------------- statement totals */

test("statement total: amount column, label text and label priority", () => {
  assert.deepEqual(findStatementTotal([["Total royalty", "", "", 40.49]], 0, 3, "."), { label: "Total royalty", value: 40.49 });
  assert.deepEqual(findStatementTotal([["Please invoice for £1,234.50"]], 0, -1, "."), { label: "Please invoice for", value: 1234.5 });
  assert.equal(findStatementTotal([["Subtotal", 10], ["Please invoice for", 12]], 0, 1, ".").label, "Please invoice for");
  assert.equal(findStatementTotal([["Notes", "x"]], 0, 1, "."), null);
});

test("a line item named 'Total ...' is never taken as the statement total", () => {
  setColumns(defaultColumns());
  const { items, statementTotal } = readStatementRows(parseCSV(
    "SKU,Name,Royalty\nS1,Total Fitness Course,12.50\nS2,Yoga,7.50\n\nTotal royalty,,20.00\n"));
  assert.equal(items.length, 2);
  assert.deepEqual(statementTotal, { label: "Total royalty", value: 20 });
});

/* ------------------------------------------------------------ watermark */

test("watermark images are stored once (shared with logos), kept while used, and removed when unused", () => {
  const WM = "data:image/png;base64,WWWW";
  lib.saveInvoiceRecord("a1", { ...snap("INV-1"), watermark: WM }, summary("INV-1"));
  lib.saveInvoiceRecord("b2", { ...snap("INV-2"), watermark: WM }, summary("INV-2"));
  assert.equal(Object.keys(lib.readLogos()).length, 2); // one logo + one watermark
  assert.equal(lib.loadSavedInvoice("a1").watermark, WM);
  assert.ok(!store.get(STORAGE_KEYS.invoiceRecordPrefix + "a1").includes("WWWW"));
  lib.deleteInvoiceRecord("a1");
  assert.equal(lib.loadSavedInvoice("b2").watermark, WM);
  lib.deleteInvoiceRecord("b2");
  assert.equal(Object.keys(lib.readLogos()).length, 0);
});

test("a backup carries watermark images", () => {
  const WM = "data:image/png;base64,WWWW";
  lib.saveInvoiceRecord("a1", { ...snap("INV-1"), watermark: WM }, summary("INV-1"));
  const file = JSON.parse(JSON.stringify(backup.buildBackup()));
  store.clear();
  backup.restoreBackup(file);
  assert.equal(lib.loadSavedInvoice("a1").watermark, WM);
});
