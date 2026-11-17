#!/usr/bin/env node
/**
 * Manages the master password and the encrypted academy details.
 *
 * The academies' company, bank and PayPal details are not in the code: they
 * are in js/secure/vault.js, encrypted with the master password. Their
 * readable copy, secrets/academy-details.json, stays on the admin's computer
 * and is never committed (see .gitignore).
 *
 *   npm run vault -- seal              encrypt secrets/academy-details.json
 *                                      into js/secure/vault.js (asks for the
 *                                      master password twice)
 *   npm run vault -- open              decrypt js/secure/vault.js back into
 *                                      secrets/academy-details.json, to edit it
 *   npm run vault -- change-password   open with the old password, seal with a new one
 *   npm run vault -- check             say whether a password is right
 *
 * After seal or change-password, run npm run build and commit
 * js/secure/vault.js and SA-Invoice-Generator.html. Everyone then enters the
 * new password once on each device.
 *
 * For scripts: --password <p> (or the VAULT_PASSWORD environment variable),
 * --in <file> and --out <file>.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import readline from "node:readline";
import { sealVault, openVault, deriveVaultKey } from "../js/secure/vault-crypto.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const command = args.find(a => !a.startsWith("--")) || "help";
const option = name => {
  const i = args.indexOf("--" + name);
  return i >= 0 ? args[i + 1] : undefined;
};
const SECRETS = path.resolve(ROOT, option("in") || "secrets/academy-details.json");
const VAULT = path.resolve(ROOT, option("out") || "js/secure/vault.js");

/** Asks for a password without showing it. */
function ask(question) {
  const given = option("password") ?? process.env.VAULT_PASSWORD;
  if (given !== undefined) return Promise.resolve(given);
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = text => { if (/\n|\r/.test(text) || text === question) process.stdout.write(text); };
    rl.question(question, answer => { rl.close(); process.stdout.write("\n"); resolve(answer); });
  });
}

async function readVault(file = VAULT) {
  const mod = await import(pathToFileURL(file).href + "?t=" + Date.now());
  return mod.default;
}

async function writeVault(vault, file = VAULT) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `/**
 * The academies' company, bank and PayPal details, encrypted with the master
 * password (AES-256-GCM, key from PBKDF2-SHA256). Written by tools/vault.mjs;
 * do not edit by hand. See js/secure/vault-crypto.js.
 */
export default ${JSON.stringify(vault, null, 2)};
`);
}

async function unlock() {
  const vault = await readVault();
  const password = await ask("Master password: ");
  try {
    return { vault, details: await openVault(vault, await deriveVaultKey(password, vault)), password };
  } catch {
    console.error("That password does not open js/secure/vault.js.");
    process.exit(1);
  }
}

async function newPassword() {
  const first = await ask("New master password (at least 10 characters): ");
  const second = option("password") ?? process.env.VAULT_PASSWORD ?? await ask("Type it again: ");
  if (first !== second) {
    console.error("The two passwords are different. Nothing was changed.");
    process.exit(1);
  }
  return first;
}

const commands = {
  async seal() {
    const details = JSON.parse(await readFile(SECRETS, "utf8"));
    await writeVault(await sealVault(details, await newPassword()));
    console.log(`Sealed ${Object.keys(details.academies || {}).length} academies into ${path.relative(ROOT, VAULT)}. Now run npm run build.`);
  },
  async open() {
    const { details } = await unlock();
    await mkdir(path.dirname(SECRETS), { recursive: true });
    await writeFile(SECRETS, JSON.stringify(details, null, 2) + "\n");
    console.log(`Wrote ${path.relative(ROOT, SECRETS)}. Edit it, then run npm run vault -- seal. Do not commit it.`);
  },
  async "change-password"() {
    const { details } = await unlock();
    delete process.env.VAULT_PASSWORD;
    const i = args.indexOf("--password");
    if (i >= 0) args.splice(i, 2, "--password", option("new-password"));
    await writeVault(await sealVault(details, await newPassword()));
    console.log("Password changed. Run npm run build, commit, and tell the team the new password.");
  },
  async check() {
    await unlock();
    console.log("That is the right password.");
  },
  help() {
    console.log("Usage: npm run vault -- seal | open | change-password | check");
  }
};

await (commands[command] || commands.help)();
