/**
 * Client address book: client details saved for reuse on later invoices.
 * Stored in localStorage under invoiceStudio.clients.v1 as a list of
 * {id, name, contact, tax, address, email}. Clients are matched by name,
 * ignoring case and surrounding spaces.
 */

import { STORAGE_KEYS } from "../constants.js";
import { readJSON, writeJSON } from "./local-storage.js";

/** Form field for each stored client property. */
export const CLIENT_FIELDS = {
  name: "clientName", contact: "clientContact", tax: "clientTax", address: "clientAddress", email: "clientEmail"
};

const text = v => (v === null || v === undefined ? "" : String(v));

export const cleanClient = c => c && typeof c === "object" && text(c.name).trim() ? {
  id: typeof c.id === "string" && c.id ? c.id : crypto.randomUUID(),
  name: text(c.name), contact: text(c.contact), tax: text(c.tax), address: text(c.address), email: text(c.email)
} : null;

/** Saved clients, sorted by name. */
export function listClients() {
  const list = readJSON(STORAGE_KEYS.clients, []);
  return (Array.isArray(list) ? list : []).map(cleanClient).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

export const writeClients = list => writeJSON(STORAGE_KEYS.clients, list);

export const clientKey = name => text(name).trim().toLowerCase();

/**
 * Adds a client, or updates the saved client with the same name.
 * @returns {{ok: boolean, updated: boolean}}
 */
export function saveClient(details) {
  const client = cleanClient(details);
  if (!client) return { ok: false, updated: false };
  const list = listClients();
  const index = list.findIndex(c => clientKey(c.name) === clientKey(client.name));
  if (index !== -1) list[index] = { ...client, id: list[index].id };
  else list.push(client);
  return { ok: writeClients(list), updated: index !== -1 };
}

export function removeClient(id) {
  return writeClients(listClients().filter(c => c.id !== id));
}
