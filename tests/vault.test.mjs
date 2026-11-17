/**
 * The master password and the encrypted academy details.
 *
 *     node --test tests/vault.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { sealVault, openVault, deriveVaultKey, vaultId } = await import("../js/secure/vault-crypto.js");

const FAST = { iterations: 1000 };

test("the right password opens the vault; a wrong one cannot", async () => {
  const payload = { version: 1, academies: { "alison-x": { fields: { paymentDetails: "IBAN: GB00 TEST" } } } };
  const vault = await sealVault(payload, "correct horse battery", FAST);
  assert.ok(!JSON.stringify(vault).includes("GB00"), "nothing readable in the vault");
  assert.deepEqual(await openVault(vault, await deriveVaultKey("correct horse battery", vault)), payload);
  const wrong = await deriveVaultKey("correct horse batterY", vault);
  await assert.rejects(() => openVault(vault, wrong));
});

test("every seal is different (new salt and nonce), so a remembered key fits one vault only", async () => {
  const a = await sealVault({ a: 1 }, "same password!!", FAST);
  const b = await sealVault({ a: 1 }, "same password!!", FAST);
  assert.notEqual(a.data, b.data);
  assert.notEqual(vaultId(a), vaultId(b));
  const keyA = await deriveVaultKey("same password!!", a);
  await assert.rejects(() => openVault(b, keyA));
});

test("short passwords are refused", async () => {
  await assert.rejects(() => sealVault({}, "short"), /at least 10/);
});

test("the test vault opens with the test password and holds all 18 academies", async () => {
  const vault = (await import("./fixtures/vault.test.js")).default;
  const details = await openVault(vault, await deriveVaultKey("test-password-123", vault));
  assert.equal(Object.keys(details.academies).length, 18);
  assert.equal(details.academies["alison-janets"].fields.companyName, "Edujanets Ltd.");
  assert.ok(!/[1-9]/.test(details.academies["alison-janets"].fields.paymentDetails), "test bank numbers are all zeros");
});

test("no bank account numbers are left readable in the app's code or tests", async () => {
  const files = [];
  const walk = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { if (!["vendor", "fixtures", "output"].includes(entry.name)) await walk(full); }
      else if (/\.(js|mjs|py|html|md|json)$/.test(entry.name) && !/logos\.js$|vault(\.test)?\.js$|package-lock/.test(entry.name)) files.push(full);
    }
  };
  for (const dir of ["js", "tests", "tools"]) await walk(path.join(ROOT, dir));
  files.push(path.join(ROOT, "index.html"), path.join(ROOT, "GOOGLE-DRIVE-SYNC.md"));
  const IBAN = /\b[A-Z]{2}\d{2}[ ]?[A-Z]{4}[ ]?(?:\d[ ]?){6,}\b/g;
  const SORT = /sort ?code[^\n]{0,6}?\b(\d{2}-?\d{2}-?\d{2})\b/gi;
  const ACCOUNT = /account (?:number|no\.?)\s*:?\s*(\d{8})\b/gi;
  const found = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    for (const re of [IBAN, SORT, ACCOUNT]) {
      for (const m of text.matchAll(re)) {
        const digits = (m[1] || m[0]).replace(/\D/g, "");
        if (/[1-9]/.test(digits)) found.push(`${path.relative(ROOT, file)}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(found, []);
});

test("the Alison templates carry no company, bank or PayPal details, only their logo", async () => {
  const dir = path.join(ROOT, "js", "templates", "alison");
  for (const name of await readdir(dir)) {
    if (["kit.js", "index.js", "logos.js", "brand.js"].includes(name)) continue;
    const text = await readFile(path.join(dir, name), "utf8");
    assert.ok(!/paymentDetails|companyAddress|clientAddress|@[a-z]/i.test(text.split("brand:")[1] || ""), name);
    assert.match(text, /brand: (\{ logo: "\w+" \}|\{\})/, name);
  }
});
