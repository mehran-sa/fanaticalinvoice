/**
 * Keeps the preload list in index.html up to date.
 *
 * index.html loads one script, js/app.js, which imports the rest. A browser
 * only finds each module after downloading the one that imports it, so the
 * 69 startup modules arrived in about ten rounds, one after another: about
 * 2 seconds on a typical connection. Listing them all with
 * <link rel="modulepreload"> lets the browser fetch them at once.
 *
 * The list sits between the "preload:start" and "preload:end" comments in
 * index.html and is written by this script; `npm run build` runs it.
 *
 *     node tools/update-preloads.mjs          rewrite the list
 *     node tools/update-preloads.mjs --check  exit 1 if it is out of date
 */

import { readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENTRY = "js/app.js";
const START = "<!-- preload:start (written by tools/update-preloads.mjs; do not edit by hand) -->";
const END = "<!-- preload:end -->";
/** Fonts the editor uses straight away (declared in css/brand.css). */
const FONTS = [
  "assets/fonts/Poppins-latin-400.woff2",
  "assets/fonts/Poppins-latin-500.woff2",
  "assets/fonts/Poppins-latin-600.woff2",
  "assets/fonts/Poppins-latin-700.woff2",
  "assets/fonts/Epilogue-latin-variable.woff2"
];

/**
 * Every module js/app.js loads at startup: static `import ... from` and
 * `export ... from` only. Modules loaded later with import() are left out.
 * @returns {string[]} paths relative to the project root, in load order
 */
export function startupModules(root = ROOT) {
  const seen = new Set();
  const order = [];
  const visit = file => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(path.join(root, file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const re = /^\s*(?:import|export)\s+(?:[^'";]*?\sfrom\s+)?["'](\.{1,2}\/[^"']+)["']/gm;
    for (const [, spec] of text.matchAll(re)) {
      visit(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)));
    }
    order.push(file);
  };
  visit(ENTRY);
  return order.filter(f => f !== ENTRY);
}

export function preloadBlock(root = ROOT) {
  const lines = [
    ...FONTS.map(f => `<link rel="preload" href="${f}" as="font" type="font/woff2" crossorigin>`),
    ...startupModules(root).map(f => `<link rel="modulepreload" href="${f}">`)
  ];
  return `${START}\n${lines.join("\n")}\n${END}`;
}

const blockPattern = () => new RegExp(`${START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END}`);

/** index.html with the list brought up to date. */
export function withPreloads(html, root = ROOT) {
  if (!blockPattern().test(html)) throw Error("index.html has no preload:start / preload:end block");
  return html.replace(blockPattern(), () => preloadBlock(root));
}

/** Removes the list (the single-file build has nothing to preload). */
export const withoutPreloads = html => html.replace(new RegExp(blockPattern().source + "\\n?"), "");

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(ROOT, "index.html");
  const html = await readFile(file, "utf8");
  const updated = withPreloads(html);
  if (process.argv.includes("--check")) {
    if (updated !== html) {
      console.error("index.html preload list is out of date. Run: npm run build");
      process.exit(1);
    }
    console.log("index.html preload list is up to date.");
  } else if (updated !== html) {
    await writeFile(file, updated);
    console.log(`index.html: preload list updated (${startupModules().length} modules).`);
  }
}
