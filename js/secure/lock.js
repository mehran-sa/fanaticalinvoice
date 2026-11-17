/**
 * The master password.
 *
 * Nothing in the app starts until the master password opens the vault
 * (js/secure/vault.js): the academies' company, bank and PayPal details are
 * encrypted there, so a wrong password cannot reveal them, even to someone
 * who downloads the app's files.
 *
 * "Remember on this device for 30 days" keeps the decryption key in this
 * browser's IndexedDB as a non-extractable key: the app can use it, but it
 * cannot be read out or copied. Changing the master password (npm run vault)
 * makes every remembered key stop working, so everyone is asked again.
 * "Lock now" in Settings forgets it.
 */

import { deriveVaultKey, openVault, vaultId, vaultSupported } from "./vault-crypto.js";
import vault from "./vault.js";
import { setAcademyDetails } from "./academy-details.js";

const REMEMBER_DAYS = 30;
const DB_NAME = "sa-invoice-generator";
const STORE = "lock";
const ENTRY = "vaultKey";
const MAX_TRIES = 5;
const WAIT_MS = 30000;

/* ------------------------------------------------- remembered key (IDB) */

function db() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(Error("No IndexedDB"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idb(mode, fn) {
  const database = await db();
  try {
    return await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE, mode);
      const request = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    database.close();
  }
}

const readRemembered = () => idb("readonly", s => s.get(ENTRY)).catch(() => null);
const remember = key => idb("readwrite", s => s.put({ id: vaultId(vault), key, expiresAt: Date.now() + REMEMBER_DAYS * 864e5 }, ENTRY)).catch(() => {});
export const forgetRemembered = () => idb("readwrite", s => s.delete(ENTRY)).catch(() => {});

/** When this device stops remembering the password, or null. */
export async function rememberedUntil() {
  const entry = await readRemembered();
  return entry && entry.id === vaultId(vault) && entry.expiresAt > Date.now() ? new Date(entry.expiresAt) : null;
}

/* ------------------------------------------------------------ opening */

async function tryKey(key) {
  try {
    const details = await openVault(vault, key);
    setAcademyDetails(details);
    return true;
  } catch {
    return false;
  }
}

async function tryRemembered() {
  const entry = await readRemembered();
  if (!entry || entry.id !== vaultId(vault) || !(entry.expiresAt > Date.now()) || !entry.key) {
    if (entry) await forgetRemembered();
    return false;
  }
  if (await tryKey(entry.key)) return true;
  await forgetRemembered();
  return false;
}

/** Opens with a password. @returns {Promise<CryptoKey|null>} the key, or null when wrong */
async function tryPassword(password) {
  const key = await deriveVaultKey(password, vault);
  return (await tryKey(key)) ? key : null;
}

/* --------------------------------------------------------- the screen */

const $ = id => document.getElementById(id);

function showScreen() {
  const screen = $("lockScreen");
  screen.hidden = false;
  const form = $("lockForm");
  const input = $("lockPassword");
  const error = $("lockError");
  const button = $("lockSubmit");
  let tries = 0;
  input.focus();
  if (!vaultSupported()) {
    error.hidden = false;
    error.textContent = "This browser cannot open the app securely here. Open it from its https:// address, or use a current version of Chrome, Edge, Firefox or Safari.";
    button.disabled = true;
  }
  return new Promise(resolve => {
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const password = input.value;
      if (!password) {
        error.hidden = false;
        error.textContent = "Enter the master password.";
        input.focus();
        return;
      }
      button.disabled = true;
      button.textContent = "Checking…";
      error.hidden = true;
      const key = await tryPassword(password).catch(() => null);
      if (key) {
        if ($("lockRemember").checked) await remember(key);
        input.value = "";
        screen.hidden = true;
        resolve();
        return;
      }
      tries++;
      input.select();
      error.hidden = false;
      if (tries >= MAX_TRIES) {
        error.textContent = "That password is not right. Too many tries: wait 30 seconds, then try again.";
        button.textContent = "Wait 30 seconds";
        setTimeout(() => {
          tries = 0;
          button.disabled = false;
          button.textContent = "Unlock";
          error.hidden = true;
          input.focus();
        }, WAIT_MS);
        return;
      }
      error.textContent = "That password is not right. Check Caps Lock, and ask your manager if you are not sure.";
      button.disabled = false;
      button.textContent = "Unlock";
    });
  });
}

/**
 * Resolves once the app is unlocked: with the key remembered on this device,
 * or after the master password is typed.
 */
export async function unlockApp() {
  if (vaultSupported()) {
    if (await tryRemembered()) return;
    // Automated checks (tests) can supply the password; it still has to be right.
    const given = globalThis.SA_UNLOCK_PASSWORD;
    if (typeof given === "string" && given && (await tryPassword(given).catch(() => null))) return;
  }
  await showScreen();
}

/** Locks this device: forgets the remembered key and shows the lock screen. */
export async function lockNow() {
  await forgetRemembered();
  location.reload();
}
