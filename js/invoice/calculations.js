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
 *
 * Money is rounded to two decimal places at each step that produces a printed
 * figure: every line amount, the subtotal, the discount, the tax, shipping and
 * the total. The invoice therefore always adds up as printed. Previously the
 * unrounded values were summed, so two lines printed as 0.13 could show a
 * subtotal of 0.25, and subtotal - discount + tax could differ from the total
 * by a penny.
 */

import { fieldValue, num, clamp, roundMoney } from "../utils.js";
import { LIMITS, FIXED_AMOUNT_KEY } from "../constants.js";
import { state, roleCol } from "../state.js";

/**
 * Value of one line item in one column. Amount columns are derived from
 * quantity x rate when both roles exist, otherwise the stored value is used.
 */
export function calculateItemValue(item, col) {
  if (col.role === "amount") {
    // A statement line with quantity 0 but a non-zero amount keeps that amount.
    if (typeof item[FIXED_AMOUNT_KEY] === "number" && Number.isFinite(item[FIXED_AMOUNT_KEY])) {
      return roundMoney(item[FIXED_AMOUNT_KEY]);
    }
    const q = roleCol("quantity");
    const r = roleCol("rate");
    return roundMoney(q && r ? num(item[q.key]) * num(item[r.key]) : num(item[col.key]));
  }
  return item[col.key] ?? "";
}

/** Money value of a single line. */
export const calculateItemTotal = (item, amountCol) => roundMoney(calculateItemValue(item, amountCol));

/**
 * When no column carries the amount role, a synthetic column is used so that a
 * plain "amount" property on each item is still picked up.
 */
export const amountColumn = () => roleCol("amount") || { role: "none", key: "amount" };

export const calculateSubtotal = (items, amountCol) =>
  roundMoney(items.reduce((sum, item) => sum + calculateItemTotal(item, amountCol), 0));

export const calculateDiscount = (subtotal, discountRate) => roundMoney(subtotal * discountRate / 100);

export const calculateTax = (taxableAmount, taxRate) => roundMoney(taxableAmount * taxRate / 100);

export const calculateTotal = (taxable, tax, shipping) => roundMoney(taxable + tax + shipping);

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
  const taxable = roundMoney(subtotal - disc);
  const tr = clampPercent(taxRate);
  const tax = calculateTax(taxable, tr);
  const ship = roundMoney(Math.max(0, shipping));
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
