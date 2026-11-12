/**
 * index.html must list every startup module for preloading (see
 * tools/update-preloads.mjs). Fails when a module was added or removed
 * without running `npm run build`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startupModules, withPreloads } from "../tools/update-preloads.mjs";

test("index.html preload list matches the startup modules (run npm run build if not)", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(withPreloads(html), html);
});

test("the preload list finds the whole module graph", async () => {
  const list = startupModules();
  assert.ok(list.length > 50);
  assert.ok(list.includes("js/invoice/invoice-renderer.js"));
  assert.ok(list.includes("js/cloud/cloud-sync.js"));
  assert.ok(!list.includes("js/app.js"), "the entry script is loaded by its own tag");
  assert.ok(!list.some(f => f.includes("vendor")), "the Excel reader is loaded only when needed");
});
