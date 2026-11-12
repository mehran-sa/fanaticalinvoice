/**
 * Tests for the Google Drive sync merge (js/cloud/sync-merge.js) and for the
 * deletion record kept by the invoice library. No network or browser needed:
 *
 *     node --test tests/cloud-sync.test.mjs
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

const { mergeForSync, listHash, normalizeClients, normalizeNamed, DELETION_MEMORY_DAYS } = await import("../js/cloud/sync-merge.js");
const lib = await import("../js/storage/invoice-library.js");
const { onLocalWrite } = await import("../js/storage/local-storage.js");
const { STORAGE_KEYS } = await import("../js/constants.js");

beforeEach(() => store.clear());

const LOGO_A = "data:image/png;base64,AAAA";
const LOGO_B = "data:image/png;base64,BBBB";
const inv = (id, updatedAt, number = id, logoRef = "") => ({
  id, updatedAt, logoRef, watermarkRef: "",
  summary: { number, client: "C", invoiceDate: "2026-11-01", total: 1, currency: "GBP" },
  data: { version: 2, fields: { invoiceNumber: number }, items: [] }
});
const doc = (over = {}) => ({
  format: "sa-invoice-generator-backup", version: 1, invoices: [], logos: {},
  clients: [], templates: [], brands: [], deleted: {}, ...over
});
const ids = d => d.invoices.map(i => i.id).sort();
const NOW = new Date("2026-11-12T10:00:00Z");

/* ---------------------------------------------------------- invoices */

test("first sync with no Drive file uploads everything here", () => {
  const local = doc({ invoices: [inv("a", "2026-11-10T00:00:00Z")], clients: [{ id: "c1", name: "Acme" }] });
  const r = mergeForSync(local, null, {}, NOW);
  assert.deepEqual(ids(r.merged), ["a"]);
  assert.equal(r.writeInvoices.length, 0);
  assert.equal(r.deleteInvoices.length, 0);
  assert.equal(r.merged.clients[0].name, "Acme");
  assert.equal(r.remoteChanges, 0);
});

test("a new device receives every invoice from Drive", () => {
  const remote = doc({ invoices: [inv("a", "2026-11-10T00:00:00Z", "A", "logo1"), inv("b", "2026-11-11T00:00:00Z")], logos: { logo1: LOGO_A } });
  const r = mergeForSync(doc(), remote, {}, NOW);
  assert.deepEqual(r.writeInvoices.map(i => i.id).sort(), ["a", "b"]);
  assert.deepEqual(ids(r.merged), ["a", "b"]);
  assert.equal(r.merged.logos.logo1, LOGO_A);
});

test("the copy changed most recently wins, in either direction", () => {
  const local = doc({ invoices: [inv("a", "2026-11-10T00:00:00Z", "LOCAL-A"), inv("b", "2026-11-12T00:00:00Z", "LOCAL-B")] });
  const remote = doc({ invoices: [inv("a", "2026-11-11T00:00:00Z", "REMOTE-A"), inv("b", "2026-11-01T00:00:00Z", "REMOTE-B")] });
  const r = mergeForSync(local, remote, {}, NOW);
  assert.deepEqual(r.writeInvoices.map(i => i.summary.number), ["REMOTE-A"]);
  const byId = Object.fromEntries(r.merged.invoices.map(i => [i.id, i.summary.number]));
  assert.deepEqual(byId, { a: "REMOTE-A", b: "LOCAL-B" });
});

test("a tie keeps this browser's copy and downloads nothing", () => {
  const t = "2026-11-10T00:00:00Z";
  const r = mergeForSync(doc({ invoices: [inv("a", t, "L")] }), doc({ invoices: [inv("a", t, "R")] }), {}, NOW);
  assert.equal(r.writeInvoices.length, 0);
  assert.equal(r.merged.invoices[0].summary.number, "L");
});

test("an invoice deleted on another device is deleted here", () => {
  const local = doc({ invoices: [inv("a", "2026-11-10T00:00:00Z"), inv("b", "2026-11-10T00:00:00Z")] });
  const remote = doc({ invoices: [inv("b", "2026-11-10T00:00:00Z")], deleted: { a: "2026-11-11T00:00:00Z" } });
  const r = mergeForSync(local, remote, {}, NOW);
  assert.deepEqual(r.deleteInvoices, [{ id: "a", deletedAt: "2026-11-11T00:00:00Z" }]);
  assert.deepEqual(ids(r.merged), ["b"]);
  assert.equal(r.merged.deleted.a, "2026-11-11T00:00:00Z");
});

test("an invoice deleted here is removed from Drive, not brought back", () => {
  const local = doc({ deleted: { a: "2026-11-11T00:00:00Z" } });
  const remote = doc({ invoices: [inv("a", "2026-11-10T00:00:00Z")] });
  const r = mergeForSync(local, remote, {}, NOW);
  assert.equal(r.writeInvoices.length, 0);
  assert.deepEqual(ids(r.merged), []);
  assert.ok(r.merged.deleted.a);
});

test("an edit made after a deletion elsewhere keeps the invoice", () => {
  const local = doc({ invoices: [inv("a", "2026-11-12T09:00:00Z")] });
  const remote = doc({ deleted: { a: "2026-11-11T00:00:00Z" } });
  const r = mergeForSync(local, remote, {}, NOW);
  assert.equal(r.deleteInvoices.length, 0);
  assert.deepEqual(ids(r.merged), ["a"]);
  assert.equal(r.merged.deleted.a, undefined);
});

test("old deletions are forgotten", () => {
  const old = new Date(NOW.getTime() - (DELETION_MEMORY_DAYS + 1) * 864e5).toISOString();
  const r = mergeForSync(doc({ deleted: { a: old, b: "2026-11-01T00:00:00Z" } }), null, {}, NOW);
  assert.deepEqual(Object.keys(r.merged.deleted), ["b"]);
});

test("images are carried with their invoices; a clashing name is renamed", () => {
  const local = doc({ invoices: [inv("a", "2026-11-10T00:00:00Z", "A", "logo1")], logos: { logo1: LOGO_A, unused: LOGO_B } });
  const remote = doc({ invoices: [inv("b", "2026-11-10T00:00:00Z", "B", "logo1")], logos: { logo1: LOGO_B } });
  const r = mergeForSync(local, remote, {}, NOW);
  const a = r.merged.invoices.find(i => i.id === "a");
  const b = r.merged.invoices.find(i => i.id === "b");
  assert.equal(r.merged.logos[a.logoRef], LOGO_A);
  assert.equal(r.merged.logos[b.logoRef], LOGO_B);
  assert.notEqual(a.logoRef, b.logoRef);
  assert.equal(Object.keys(r.merged.logos).length, 2, "unused images are not uploaded");
});

/* -------------------------------------------------------------- lists */

const clientsA = [{ id: "1", name: "Acme" }, { id: "2", name: "Beta" }];

test("first sync combines clients from both sides by name", () => {
  const r = mergeForSync(doc({ clients: [{ id: "1", name: "Acme" }] }),
    doc({ clients: [{ id: "9", name: "acme " }, { id: "2", name: "Beta" }] }), {}, NOW);
  assert.deepEqual(r.merged.clients.map(c => c.name), ["Acme", "Beta"]);
  assert.ok(r.lists.clients, "the combined list is written here");
});

test("a client deleted on another device is deleted here", () => {
  const base = listHash(normalizeClients(clientsA));
  const r = mergeForSync(doc({ clients: clientsA }), doc({ clients: [clientsA[0]] }), { clients: base }, NOW);
  assert.deepEqual(r.lists.clients.map(c => c.name), ["Acme"]);
});

test("a client edited here is kept when Drive has not changed", () => {
  const base = listHash(normalizeClients(clientsA));
  const edited = [{ ...clientsA[0], email: "new@acme.test" }, clientsA[1]];
  const r = mergeForSync(doc({ clients: edited }), doc({ clients: clientsA }), { clients: base }, NOW);
  assert.equal(r.lists.clients, undefined);
  assert.equal(r.merged.clients[0].email, "new@acme.test");
});

test("clients changed on both sides are combined, keeping this browser's edits", () => {
  const base = listHash(normalizeClients(clientsA));
  const local = [{ ...clientsA[0], email: "here@acme.test" }, clientsA[1]];
  const remote = [{ ...clientsA[0], email: "there@acme.test" }, clientsA[1], { id: "3", name: "Gamma" }];
  const r = mergeForSync(doc({ clients: local }), doc({ clients: remote }), { clients: base }, NOW);
  assert.deepEqual(r.merged.clients.map(c => c.name), ["Acme", "Beta", "Gamma"]);
  assert.equal(r.merged.clients[0].email, "here@acme.test");
});

test("templates and brands follow the same rules, and unsafe images are dropped", () => {
  const t1 = { name: "Monthly", data: { logo: LOGO_A } };
  const base = listHash(normalizeNamed([t1]));
  const remote = [t1, { name: "Weekly", data: { logo: "javascript:alert(1)" } }];
  const r = mergeForSync(doc({ templates: [t1] }), doc({ templates: remote }), { templates: base }, NOW);
  assert.deepEqual(r.lists.templates.map(t => t.name), ["Monthly", "Weekly"]);
  assert.equal(r.lists.templates[1].data.logo, "");
});

/* --------------------------------------------- invoice library deletions */

test("deleting an invoice records when, and notifies the write listeners", () => {
  const keys = [];
  onLocalWrite(k => keys.push(k));
  lib.saveInvoiceRecord("x1", { version: 2, logo: "", fields: {}, items: [] }, { number: "1" });
  lib.deleteInvoiceRecord("x1", { deletedAt: "2026-11-12T00:00:00.000Z" });
  assert.deepEqual(lib.readDeletedInvoices(), { x1: "2026-11-12T00:00:00.000Z" });
  assert.ok(keys.includes(STORAGE_KEYS.deletedInvoices));
  assert.ok(keys.includes(STORAGE_KEYS.invoiceRecordPrefix + "x1"));
  // A later deletion time replaces an earlier one, never the other way round.
  lib.deleteInvoiceRecord("x1", { deletedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(lib.readDeletedInvoices().x1, "2026-11-12T00:00:00.000Z");
});
