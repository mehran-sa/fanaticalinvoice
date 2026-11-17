/**
 * The vault: the academies' company, bank and PayPal details, encrypted with
 * the master password. The same code runs in the browser and in
 * tools/vault.mjs (Node 18+), using the standard Web Crypto API.
 *
 *   key   PBKDF2-SHA256, 600,000 rounds, from the password and a random salt
 *   data  AES-256-GCM with a random 12-byte nonce. GCM also proves the
 *         password: a wrong one cannot decrypt, so nothing about the password
 *         is stored anywhere.
 *
 * A vault file looks like
 *   { v: 1, kdf: "PBKDF2-SHA256", iterations, salt, iv, data }   (base64)
 */

const subtle = () => globalThis.crypto?.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();
const AAD = enc.encode("sa-invoice-generator-vault-v1");
export const VAULT_ITERATIONS = 600000;

const toB64 = bytes => {
  let s = "";
  const view = new Uint8Array(bytes);
  for (let i = 0; i < view.length; i++) s += String.fromCharCode(view[i]);
  return btoa(s);
};
const fromB64 = text => Uint8Array.from(atob(text), c => c.charCodeAt(0));

/** Whether this browser can open the vault (Web Crypto needs https or localhost). */
export const vaultSupported = () => Boolean(subtle());

/**
 * The AES key for a vault and password.
 * @param {boolean} extractable false in the browser: the key can be used to
 *        decrypt but never read out, even when remembered on the device
 */
export async function deriveVaultKey(password, vault, { extractable = false } = {}) {
  const base = await subtle().importKey("raw", enc.encode(String(password).normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: fromB64(vault.salt), iterations: vault.iterations || VAULT_ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    extractable,
    ["encrypt", "decrypt"]
  );
}

/**
 * Opens a vault with a key.
 * @returns {Promise<object>} the details
 * @throws when the key (password) is wrong or the vault is damaged
 */
export async function openVault(vault, key) {
  const plain = await subtle().decrypt({ name: "AES-GCM", iv: fromB64(vault.iv), additionalData: AAD }, key, fromB64(vault.data));
  return JSON.parse(dec.decode(plain));
}

/** Encrypts details with a password into a new vault (new salt and nonce). */
export async function sealVault(payload, password, { iterations = VAULT_ITERATIONS } = {}) {
  if (String(password).length < 10) throw Error("The master password must be at least 10 characters.");
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const vault = { v: 1, kdf: "PBKDF2-SHA256", iterations, salt: toB64(salt), iv: toB64(iv) };
  const key = await deriveVaultKey(password, vault);
  const data = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: AAD }, key, enc.encode(JSON.stringify(payload)));
  return { ...vault, data: toB64(data) };
}

/** Identifies a vault (its salt): a remembered key only fits the vault it was made for. */
export const vaultId = vault => String(vault?.salt || "");
