/**
 * Merging this browser's data with the copy in Google Drive.
 *
 * Pure functions with no browser or network access, so they can be tested on
 * their own (tests/cloud-sync.test.mjs). js/cloud/cloud-sync.js does the
 * reading, writing and uploading.
 *
 * The Drive copy is an ordinary full backup (js/storage/backup.js, format
 * "sa-invoice-generator-backup" version 1) with one extra field:
 *   deleted: {invoiceId: ISO time it was deleted}
 * so it can also be downloaded from Drive and used with "Restore from backup".
 *
 * Rules:
 *  - Invoices: for each invoice, the copy changed most recently wins. If it was
 *    deleted (on any device) after its last change, it is deleted everywhere.
 *  - Clients, templates and brands are each one list. Compared with the list as
 *    it was after the last sync on this device ("base"):
 *      changed only here       -> this browser's list is kept;
 *      changed only in Drive   -> Drive's list replaces this browser's (so a
 *                                 deletion or an edit made elsewhere arrives);
 *      changed in both, or this browser has never synced
 *                              -> both are combined: everything here, plus
 *                                 anything from Drive whose name is not here.
 */

import { cleanClient, clientKey } from "../storage/client-book.js";
import { isSafeLogo } from "../invoice/snapshot.js";

/** Deletions are remembered this long, then forgotten. */
export const DELETION_MEMORY_DAYS = 400;

const isObject = v => v !== null && typeof v === "object" && !Array.isArray(v);
const nameKey = v => String(v ?? "").trim().toLowerCase();
const validTime = v => typeof v === "string" && !Number.isNaN(new Date(v).getTime());

/** 32-bit FNV-1a of the JSON text: enough to tell whether a list changed. */
export function listHash(list) {
  const text = JSON.stringify(list ?? []);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return text.length.toString(36) + "_" + hash.toString(36);
}

/* ------------------------------------------------------------- lists */

const sortClients = list => list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

/** Clients in the stored shape, sorted the way listClients() returns them. */
export function normalizeClients(list) {
  return sortClients((Array.isArray(list) ? list : []).map(cleanClient).filter(Boolean));
}

/** Templates or brands: {name, data} entries, with unsafe images removed. */
export function normalizeNamed(list) {
  const out = [];
  for (const entry of Array.isArray(list) ? list : []) {
    if (!isObject(entry) || !nameKey(entry.name) || !isObject(entry.data)) continue;
    const copy = JSON.parse(JSON.stringify(entry));
    if (copy.data.logo && !isSafeLogo(copy.data.logo)) copy.data.logo = "";
    if (copy.data.watermark && !isSafeLogo(copy.data.watermark)) copy.data.watermark = "";
    out.push(copy);
  }
  return out;
}

/**
 * Three-way merge of one list.
 * @returns {{list: object[], changedLocally: boolean}} the merged list and
 *          whether it differs from the local one
 */
export function mergeList(local, remote, base, keyOf, normalize) {
  const localList = normalize(local);
  if (remote === undefined || remote === null) return { list: localList, changedLocally: false };
  const remoteList = normalize(remote);
  const lh = listHash(localList);
  const rh = listHash(remoteList);
  if (lh === rh) return { list: localList, changedLocally: false };
  if (base && lh === base) return { list: remoteList, changedLocally: true };
  if (base && rh === base) return { list: localList, changedLocally: false };
  // Changed on both sides, or first sync here: keep everything from both.
  const names = new Set(localList.map(x => keyOf(x.name)));
  const extra = remoteList.filter(x => !names.has(keyOf(x.name)));
  if (!extra.length) return { list: localList, changedLocally: false };
  const combined = normalize([...localList, ...extra]);
  return { list: combined, changedLocally: true };
}

/* ---------------------------------------------------------- invoices */

const invoiceTime = item => (validTime(item?.updatedAt) ? item.updatedAt : new Date(0).toISOString());

/**
 * Merges this browser's data with the Drive copy.
 *
 * @param {object} local  buildBackup() of this browser plus `deleted`
 * @param {object|null} remote  the Drive copy, or null when there is none yet
 *        (or when it has not changed since this browser last synced)
 * @param {{clients?: string, templates?: string, brands?: string}} base list
 *        hashes recorded after the last sync on this device
 * @param {Date} [now]
 * @returns {{
 *   merged: object,                 the backup to upload
 *   writeInvoices: object[],        Drive invoices newer than this browser's
 *   deleteInvoices: {id: string, deletedAt: string}[],
 *   lists: {clients?: object[], templates?: object[], brands?: object[]},
 *                                   lists to replace in this browser
 *   remoteChanges: number           how many things arrived from Drive
 * }}
 */
export function mergeForSync(local, remote, base = {}, now = new Date()) {
  const localInvoices = new Map();
  for (const item of Array.isArray(local.invoices) ? local.invoices : []) {
    if (isObject(item) && item.id) localInvoices.set(item.id, item);
  }
  const remoteInvoices = new Map();
  const remoteOk = isObject(remote);
  if (remoteOk) {
    for (const item of Array.isArray(remote.invoices) ? remote.invoices : []) {
      if (isObject(item) && typeof item.id === "string" && item.id) remoteInvoices.set(item.id, item);
    }
  }
  const localLogos = isObject(local.logos) ? local.logos : {};
  const remoteLogos = remoteOk && isObject(remote.logos) ? remote.logos : {};

  // Deletions from both sides; the later time wins. Old ones are forgotten.
  const cutoff = new Date(now.getTime() - DELETION_MEMORY_DAYS * 864e5).toISOString();
  const deleted = {};
  for (const source of [local.deleted, remoteOk ? remote.deleted : null]) {
    if (!isObject(source)) continue;
    for (const [id, at] of Object.entries(source)) {
      if (!validTime(at) || at < cutoff) continue;
      if (!deleted[id] || deleted[id] < at) deleted[id] = at;
    }
  }

  const merged = {
    ...local,
    invoices: [],
    logos: {},
    deleted: {}
  };
  const writeInvoices = [];
  const deleteInvoices = [];
  let remoteChanges = 0;

  /** Copies an invoice's images into merged.logos, renaming on a clash. */
  const carryImages = (item, logos) => {
    const copy = { ...item };
    for (const field of ["logoRef", "watermarkRef"]) {
      const ref = copy[field];
      if (!ref || !logos[ref]) continue;
      let target = ref;
      for (let n = 2; merged.logos[target] && merged.logos[target] !== logos[ref]; n++) target = `${ref}_r${n}`;
      merged.logos[target] = logos[ref];
      copy[field] = target;
    }
    return copy;
  };

  const ids = new Set([...localInvoices.keys(), ...remoteInvoices.keys()]);
  for (const id of ids) {
    const mine = localInvoices.get(id);
    const theirs = remoteInvoices.get(id);
    // Ties go to this browser's copy.
    const useTheirs = theirs && (!mine || invoiceTime(theirs) > invoiceTime(mine));
    const winner = useTheirs ? theirs : mine;
    const deletedAt = deleted[id];
    if (deletedAt && deletedAt >= invoiceTime(winner)) {
      if (mine) {
        deleteInvoices.push({ id, deletedAt });
        remoteChanges++;
      }
      continue;
    }
    delete deleted[id];
    merged.invoices.push(carryImages(winner, useTheirs ? remoteLogos : localLogos));
    if (useTheirs) {
      writeInvoices.push(theirs);
      remoteChanges++;
    }
  }
  merged.deleted = deleted;

  const lists = {};
  const remoteList = key => (remoteOk ? remote[key] : null);
  const clients = mergeList(local.clients, remoteList("clients"), base.clients, clientKey, normalizeClients);
  const templates = mergeList(local.templates, remoteList("templates"), base.templates, nameKey, normalizeNamed);
  const brands = mergeList(local.brands, remoteList("brands"), base.brands, nameKey, normalizeNamed);
  merged.clients = clients.list;
  merged.templates = templates.list;
  merged.brands = brands.list;
  if (clients.changedLocally) { lists.clients = clients.list; remoteChanges++; }
  if (templates.changedLocally) { lists.templates = templates.list; remoteChanges++; }
  if (brands.changedLocally) { lists.brands = brands.list; remoteChanges++; }

  return { merged, writeInvoices, deleteInvoices, lists, remoteChanges };
}
