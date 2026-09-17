/**
 * Converts bundle rows into invoice line items.
 *
 * Items are keyed against the user's current columns rather than fixed field
 * names, so this keeps working when columns have been renamed, reordered or
 * given different calculation roles. Rate is back-derived from the amount the
 * same way the spreadsheet importer does it.
 */

import { num } from "../utils.js";
import { state, roleCol } from "../state.js";
import { getBundleSummary } from "./bundle-rows.js";

/** Finds a column by key, case-insensitively. */
const columnByKey = key => state.columns.find(c => String(c.key).toLowerCase() === key);

/**
 * Builds one item from named parts, assigning each to whichever column
 * currently carries the matching key or calculation role.
 */
function buildItem({ sku, description, quantity, amount }) {
  const item = {};
  const assign = (col, value) => { if (col && value !== undefined) item[col.key] = value; };

  assign(columnByKey("sku"), sku);
  assign(columnByKey("description"), description);

  const qtyCol = roleCol("quantity");
  const amountCol = roleCol("amount");
  const rateCol = roleCol("rate");

  assign(qtyCol, quantity);
  assign(amountCol, amount);

  if (rateCol && amountCol && num(amount)) {
    item[rateCol.key] = num(amount) / Math.max(1, num(quantity) || 1);
  }

  // A column set with no sku/description column still needs the course text
  // somewhere, so fall back to the first visible text column.
  if (item[columnByKey("description")?.key] === undefined && description !== undefined) {
    const textCol = state.columns.find(c => c.type === "text" && c.role === "none");
    if (textCol && item[textCol.key] === undefined) item[textCol.key] = description;
  }

  return item;
}

/** One invoice line per course. */
export const itemsFromRows = rows => rows.map(r => buildItem({
  sku: r.SKU,
  description: r.CourseName,
  quantity: r.NetQty,
  amount: r.Royalty
}));

/** One invoice line per bundle, priced at its total royalty. */
export const itemsFromBundles = rows => getBundleSummary(rows).map(b => buildItem({
  description: b.Bundle,
  quantity: b.NetQty,
  amount: Number(b.BundlePrice.toFixed(2))
}));
