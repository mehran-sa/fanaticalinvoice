/**
 * All financial calculation logic.
 *
 * The exported calculate* functions are pure. getTotals() is the thin adapter
 * that reads the three rate fields from the editor and feeds the pure code,
 * preserving the original behaviour exactly:
 *
 *   discount applies to the subtotal
 *   tax applies to the discounted subtotal
 *   shipping is added last and is never taxed
 */

import { fieldValue, num, clamp } from "../utils.js";
import { LIMITS } from "../constants.js";
import { state, roleCol } from "../state.js";

/**
 * Value of one line item in one column. Amount columns are derived from
 * quantity x rate when both roles exist, otherwise the stored value is used.
 */
export function calculateItemValue(item, col) {
  if (col.role === "amount") {
    const q = roleCol("quantity");
    const r = roleCol("rate");
    return q && r ? num(item[q.key]) * num(item[r.key]) : num(item[col.key]);
  }
  return item[col.key] ?? "";
}

/** Money value of a single line. */
export const calculateItemTotal = (item, amountCol) => num(calculateItemValue(item, amountCol));

/**
 * When no column carries the amount role, a synthetic column is used so that a
 * plain "amount" property on each item is still picked up.
 */
export const amountColumn = () => roleCol("amount") || { role: "none", key: "amount" };

export const calculateSubtotal = (items, amountCol) =>
  items.reduce((sum, item) => sum + calculateItemTotal(item, amountCol), 0);

export const calculateDiscount = (subtotal, discountRate) => subtotal * discountRate / 100;

export const calculateTax = (taxableAmount, taxRate) => taxableAmount * taxRate / 100;

export const calculateTotal = (taxable, tax, shipping) => taxable + tax + shipping;

/** Sum of the quantity column, used by the One Education in-table totals row. */
export const calculateQuantityTotal = items => {
  const qtyCol = roleCol("quantity");
  return qtyCol ? items.reduce((sum, item) => sum + num(item[qtyCol.key]), 0) : 0;
};

const clampPercent = value => clamp(value, LIMITS.percent.min, LIMITS.percent.max);

/**
 * @typedef {Object} Totals
 * @property {number} subtotal
 * @property {number} dr    Discount rate, clamped to 0-100.
 * @property {number} disc  Discount amount.
 * @property {number} tr    Tax rate, clamped to 0-100.
 * @property {number} tax   Tax amount.
 * @property {number} ship
 * @property {number} total
 */

/** Pure totals calculation. @returns {Totals} */
export function calculateTotals({ subtotal, discountRate, taxRate, shipping }) {
  const dr = clampPercent(discountRate);
  const disc = calculateDiscount(subtotal, dr);
  const taxable = subtotal - disc;
  const tr = clampPercent(taxRate);
  const tax = calculateTax(taxable, tr);
  const ship = Math.max(0, shipping);
  return { subtotal, dr, disc, tr, tax, ship, total: calculateTotal(taxable, tax, ship) };
}

/** Reads the editor rate fields and returns the current invoice totals. */
export function getTotals() {
  return calculateTotals({
    subtotal: calculateSubtotal(state.items, amountColumn()),
    discountRate: num(fieldValue("discount")),
    taxRate: num(fieldValue("tax")),
    shipping: num(fieldValue("shipping"))
  });
}
