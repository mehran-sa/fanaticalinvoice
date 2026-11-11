/**
 * Saved-invoices library.
 *
 * Every invoice is kept on this device in localStorage:
 *
 *   invoiceStudio.invoiceIndex.v1     list of {id, number, client, invoiceDate,
 *                                     total, currency, updatedAt}, small enough
 *                                     to read for the list and number checks
 *   invoiceStudio.invoice.<id>        one record per invoice:
 *                                     {id, updatedAt, logoRef, data}, where data
 *                                     is a serialize() snapshot without its logo
 *   invoiceStudio.logos.v1            {logoRef: data URL}, each logo stored once
 *   invoiceStudio.logoIndex.v1        the keys of that map (small, checked on
 *                                     every save)
 *
 * Logos are stored once and shared. localStorage holds about 5 MB per site, so
 * keeping a copy of the logo in every invoice would fill it after a handful of
 * invoices.
 *
 * The working-invoice autosave (invoiceStudioPro.v2) is kept as before, so the
 * last open invoice still restores the same way and older versions of the app
 * can still read it.
 */

import { STORAGE_KEYS } from "../constants.js";
import { readRaw, writeRaw, readJSON, writeJSON, remove } from "./local-storage.js";

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
export const isInvoiceId = id => typeof id === "string" && ID_PATTERN.test(id);
export const recordKey = id => STORAGE_KEYS.invoiceRecordPrefix + id;
export const newInvoiceId = () => crypto.randomUUID();

/* --------------------------------------------------------------- logos */

/** Content key for a logo: length plus a 32-bit FNV-1a hash of the data URL. */
export function logoRefFor(dataUrl) {
  if (!dataUrl) return "";
  let hash = 0x811c9dc5;
  for (let i = 0; i < dataUrl.length; i++) {
    hash ^= dataUrl.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `logo_${dataUrl.length.toString(36)}_${hash.toString(36)}`;
}

export const readLogos = () => {
  const map = readJSON(STORAGE_KEYS.logos, {});
  return map && typeof map === "object" && !Array.isArray(map) ? map : {};
};

const readLogoIndex = () => {
  const list = readJSON(STORAGE_KEYS.logoIndex, null);
  return Array.isArray(list) ? list : Object.keys(readLogos());
};

function writeLogos(logos) {
  return writeJSON(STORAGE_KEYS.logos, logos) && writeJSON(STORAGE_KEYS.logoIndex, Object.keys(logos));
}

/**
 * The last logo stored, so an unchanged logo is not re-read on every save.
 * It is trusted only while its key is still listed in the small logo index:
 * another tab may have removed the logo, or storage may have been restored.
 */
const lastStored = { logo: { dataUrl: null, ref: "" }, watermark: { dataUrl: null, ref: "" } };

/**
 * Stores an image (a logo, or since 2.8.0 a watermark image) once and returns
 * its key, or null when it could not be stored. Both kinds share one store.
 */
function storeLogo(dataUrl, slot = "logo") {
  if (!dataUrl) return "";
  const last = lastStored[slot];
  if (dataUrl === last.dataUrl && readLogoIndex().includes(last.ref)) return last.ref;
  const ref = storeLogoIn(dataUrl, readLogos());
  lastStored[slot] = ref ? { dataUrl, ref } : { dataUrl: null, ref: "" };
  return ref;
}

function storeLogoIn(dataUrl, logos) {
  let ref = logoRefFor(dataUrl);
  // Two different images with the same key are vanishingly unlikely, but a
  // clash must never show the wrong logo.
  for (let n = 2; logos[ref] && logos[ref] !== dataUrl; n++) ref = logoRefFor(dataUrl) + "_" + n;
  if (logos[ref] === dataUrl) {
    // Present already; make sure the index lists it (older data has no index).
    if (!readLogoIndex().includes(ref)) writeJSON(STORAGE_KEYS.logoIndex, Object.keys(logos));
    return ref;
  }
  logos[ref] = dataUrl;
  return writeLogos(logos) ? ref : null;
}

/** Removes logos that no saved invoice uses any more. */
export function removeUnusedLogos() {
  lastStored.logo = { dataUrl: null, ref: "" };
  lastStored.watermark = { dataUrl: null, ref: "" };
  const used = new Set(listInvoices().flatMap(entry => {
    const record = readRecord(entry.id);
    return [record?.logoRef, record?.watermarkRef];
  }).filter(Boolean));
  const logos = readLogos();
  let changed = false;
  for (const ref of Object.keys(logos)) {
    if (!used.has(ref)) { delete logos[ref]; changed = true; }
  }
  if (changed) writeLogos(logos);
}

/* --------------------------------------------------------------- index */

const cleanEntry = e => e && typeof e === "object" && isInvoiceId(e.id) ? {
  id: e.id,
  number: String(e.number ?? ""),
  client: String(e.client ?? ""),
  invoiceDate: String(e.invoiceDate ?? ""),
  total: Number.isFinite(Number(e.total)) ? Number(e.total) : 0,
  currency: String(e.currency ?? ""),
  updatedAt: String(e.updatedAt ?? "")
} : null;

/** Saved invoices, most recently changed first. */
export function listInvoices() {
  const list = readJSON(STORAGE_KEYS.invoiceIndex, []);
  return (Array.isArray(list) ? list : []).map(cleanEntry).filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

const writeIndex = list => writeJSON(STORAGE_KEYS.invoiceIndex, list);

/** Other saved invoices that use this invoice number (case-insensitive). */
export function invoicesWithNumber(number, exceptId) {
  const wanted = String(number ?? "").trim().toLowerCase();
  if (!wanted) return [];
  return listInvoices().filter(e => e.id !== exceptId && e.number.trim().toLowerCase() === wanted);
}

/* ------------------------------------------------------------- records */

export function readRecord(id) {
  if (!isInvoiceId(id)) return null;
  const record = readJSON(recordKey(id), null);
  return record && typeof record === "object" && record.data && typeof record.data === "object" ? record : null;
}

/** A saved invoice's full snapshot, logo included, or null. */
export function loadSavedInvoice(id) {
  const record = readRecord(id);
  if (!record) return null;
  const images = record.logoRef || record.watermarkRef ? readLogos() : {};
  const logo = record.logoRef ? images[record.logoRef] || "" : "";
  const watermark = record.watermarkRef ? images[record.watermarkRef] || "" : "";
  return { ...record.data, logo, watermark, invoiceId: id };
}

/**
 * Saves one invoice.
 * @param {string} id
 * @param {object} snapshot serialize() result (logo included)
 * @param {{number: string, client: string, invoiceDate: string, total: number, currency: string}} summary
 * @returns {{ok: boolean, text?: string}} text is the stored record, for the
 *          multi-tab check
 */
export function saveInvoiceRecord(id, snapshot, summary, updatedAt = new Date().toISOString()) {
  if (!isInvoiceId(id)) return { ok: false };
  const logoRef = storeLogo(snapshot.logo || "");
  if (logoRef === null) return { ok: false };
  const watermarkRef = storeLogo(snapshot.watermark || "", "watermark");
  if (watermarkRef === null) return { ok: false };
  const { logo, watermark, invoiceId, ...data } = snapshot;
  const record = { id, updatedAt, logoRef, data };
  if (watermarkRef) record.watermarkRef = watermarkRef;
  const text = JSON.stringify(record);
  if (!writeRaw(recordKey(id), text)) return { ok: false };

  const list = listInvoices().filter(e => e.id !== id);
  list.push(cleanEntry({ id, updatedAt, ...summary }));
  if (!writeIndex(list)) return { ok: false };
  return { ok: true, text };
}

/** Deletes a saved invoice and any logo only it used. */
export function deleteInvoiceRecord(id) {
  remove(recordKey(id));
  const ok = writeIndex(listInvoices().filter(e => e.id !== id));
  removeUnusedLogos();
  return ok;
}

/** Raw stored record text (used by the multi-tab check). */
export const readRecordText = id => (isInvoiceId(id) ? readRaw(recordKey(id)) : null);
