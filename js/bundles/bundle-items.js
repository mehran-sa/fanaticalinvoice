/**
 * Converts bundle rows into invoice line items.
 *
 * Items are keyed against the user's current columns rather than fixed field
 * names, so this keeps working when columns have been renamed, reordered or
 * given different calculation roles. Rate is back-derived from the amount the
 * same way the spreadsheet importer does it.
 */

import { num, parseAmount, roundMoney } from "../utils.js";
import { state, roleCol } from "../state.js";
import { getBundleSummary } from "./bundle-rows.js";
import { FIXED_AMOUNT_KEY } from "../constants.js";

/** Finds a column by key, case-insensitively. */
const columnByKey = key => state.columns.find(c => String(c.key).toLowerCase() === key);

/**
 * Builds one item from named parts, assigning each to whichever column
 * currently carries the matching key or calculation role.
 */
function buildItem({ sku, description, quantity, amount, decimal }) {
  const item = {};
  const assign = (col, value) => { if (col && value !== undefined) item[col.key] = value; };

  assign(columnByKey("sku"), sku);
  assign(columnByKey("description"), description);

  const qtyCol = roleCol("quantity");
  const amountCol = roleCol("amount");
  const rateCol = roleCol("rate");

  // Formatted text such as "£1,234.50" becomes a number; anything that is not
  // a number is kept as written.
  const asNumber = value => {
    const parsed = parseAmount(value, decimal);
    return parsed === null ? value : parsed;
  };
  quantity = asNumber(quantity);
  amount = asNumber(amount);
  // A sheet without a Net Qty column (or a blank cell) means one unit, as in the
  // spreadsheet importer; a blank quantity would price the line at 0 x rate.
  if (String(quantity ?? "").trim() === "") quantity = 1;

  assign(qtyCol, quantity);
  assign(amountCol, amount);

  // Rate is back-derived so that quantity x rate reproduces the amount. The
  // divisor is the real quantity: Math.max(1, quantity) flipped the sign of
  // refund lines (qty -1, amount -5 became +5) and halved lines with a
  // fractional quantity such as 0.5.
  if (rateCol && amountCol && num(amount)) {
    item[rateCol.key] = num(amount) / (num(quantity) || 1);
  }
  // Net quantity 0 with a non-zero royalty: keep the royalty as the amount,
  // since quantity x rate would be 0.
  if (qtyCol && amountCol && num(quantity) === 0 && num(amount)) {
    item[FIXED_AMOUNT_KEY] = num(amount);
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
  amount: r.Royalty,
  decimal: r.Decimal
}));

/** One invoice line per bundle, priced at its total royalty. */
export const itemsFromBundles = rows => getBundleSummary(rows).map(b => buildItem({
  description: b.Bundle,
  // No quantity in the sheet: leave it blank so buildItem() uses one unit.
  quantity: b.HasQty ? b.NetQty : "",
  amount: roundMoney(b.BundlePrice)
}));
