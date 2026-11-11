/**
 * Unit and regression tests for SA Invoice Generator's non-DOM logic.
 *
 * Run from the project folder with Node 18 or later (no packages needed):
 *
 *     node --test tests/
 *
 * Each "regression" test names the defect it guards against.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  roundMoney, parseAmount, plusDays, isIsoDate, localIsoDate, num, detectDecimalSeparator
} from "../js/utils.js";
import { nextInvoiceNumber } from "../js/invoice/invoice-data.js";
import { FIXED_AMOUNT_KEY } from "../js/constants.js";
import { pageCentres } from "../js/invoice/watermark.js";
import { ukhfDate } from "../js/templates/ukhf.js";
import {
  calculateTotals, calculateSubtotal, calculateItemValue, amountColumn
} from "../js/invoice/calculations.js";
import { dateFmt, fmtCell, money } from "../js/invoice/formatters.js";
import { normalizeSnapshot, isSafeLogo } from "../js/invoice/snapshot.js";
import { state, defaultColumns, setColumns, setItems } from "../js/state.js";
import { mapRows } from "../js/import-export/row-mapper.js";
import { parseCSV } from "../js/import-export/csv.js";
import { extractBundleRows, getBundleSummary } from "../js/bundles/bundle-rows.js";
import { itemsFromRows, itemsFromBundles } from "../js/bundles/bundle-items.js";
import { splitName } from "../js/bundles/name-splitter.js";
import { createHistoryStack } from "../js/history/history-stack.js";

const resetState = () => {
  setColumns(defaultColumns());
  setItems([]);
};

/* ------------------------------------------------------------ money */

test("roundMoney rounds half away from zero without float error", () => {
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(10.025), 10.03);
  assert.equal(roundMoney(2.675), 2.68);
  assert.equal(roundMoney(-1.005), -1.01);
  assert.equal(roundMoney(0.1 + 0.2), 0.3);
  assert.equal(roundMoney(0), 0);
  assert.equal(roundMoney("abc"), 0);
  assert.equal(roundMoney(123456789.995), 123456790);
});

test("parseAmount reads formatted amounts and rejects non-numbers", () => {
  const cases = [
    ["1,234.50", 1234.5], ["£99.99", 99.99], ["$ 12", 12], ["(5.00)", -5],
    ["-3", -3], ["12,5", 12.5], ["1.234,50", 1234.5], ["1 234,50", 1234.5],
    ["GBP 10", 10], ["€1.234.567", 1234567], [42, 42], ["  7 ", 7]
  ];
  for (const [input, expected] of cases) assert.equal(parseAmount(input), expected, String(input));
  for (const bad of ["", "abc", "N/A", "1-2", null, undefined, {}, NaN]) {
    assert.equal(parseAmount(bad), null, String(bad));
  }
});

/* ------------------------------------------------------------- dates */

test("regression: plusDays keeps local calendar dates (due date was a day early east of UTC)", () => {
  assert.equal(plusDays("2026-10-15", 14), "2026-10-29");
  assert.equal(plusDays("2026-03-20", 14), "2026-04-03"); // across the UK clock change
  assert.equal(plusDays("2026-12-25", 14), "2027-01-08");
  assert.equal(plusDays("2028-02-28", 1), "2028-02-29");
  assert.equal(plusDays("not a date", 14), "");
});

test("isIsoDate accepts only real YYYY-MM-DD dates", () => {
  assert.ok(isIsoDate("2026-02-28"));
  assert.ok(!isIsoDate("2026-02-30"));
  assert.ok(!isIsoDate("28/02/2026"));
  assert.ok(!isIsoDate(""));
  assert.equal(localIsoDate(new Date(2026, 0, 5)), "2026-01-05");
});

test("regression: dateFmt returns non-ISO text instead of throwing RangeError", () => {
  assert.equal(dateFmt("01/02/2026"), "01/02/2026");
  assert.equal(dateFmt(""), "\u2014");
  assert.match(dateFmt("2026-10-15"), /2026/);
});

test("fmtCell escapes text that reaches a date column", () => {
  const html = fmtCell("<img src=x onerror=alert(1)>", { type: "date" });
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;img"));
});

test("money formats with an explicit currency and falls back for unknown codes", () => {
  assert.match(money(1234.5, "GBP"), /1,234\.50/);
  assert.equal(money(5, "NOT A CODE"), "NOT A CODE 5.00");
});

/* ------------------------------------------------------- calculations */

test("regression: subtotal is the sum of the printed (rounded) line amounts", () => {
  resetState();
  const items = [{ quantity: 1, rate: 0.125 }, { quantity: 1, rate: 0.125 }];
  assert.equal(calculateSubtotal(items, amountColumn()), 0.26);
});

test("regression: subtotal - discount + tax + shipping equals the printed total", () => {
  resetState();
  const subtotal = calculateSubtotal([{ quantity: 1, rate: 10.025 }], amountColumn());
  const t = calculateTotals({ subtotal, discountRate: 0, taxRate: 20, shipping: 0 });
  assert.deepEqual([t.subtotal, t.tax, t.total], [10.03, 2.01, 12.04]);

  for (const [rate, qty, d, tx, ship] of [[19.99, 3, 12.5, 20, 4.99], [0.333, 7, 3.3, 17.5, 0], [1e6 / 3, 1, 0, 15, 0]]) {
    const st = calculateSubtotal([{ quantity: qty, rate }], amountColumn());
    const r = calculateTotals({ subtotal: st, discountRate: d, taxRate: tx, shipping: ship });
    const cents = v => Math.round(v * 100);
    assert.equal(cents(r.subtotal) - cents(r.disc) + cents(r.tax) + cents(r.ship), cents(r.total));
  }
});

test("totals clamp rates to 0-100 and ignore negative shipping", () => {
  const r = calculateTotals({ subtotal: 100, discountRate: 150, taxRate: -5, shipping: -10 });
  assert.equal(r.dr, 100);
  assert.equal(r.tr, 0);
  assert.equal(r.ship, 0);
  assert.equal(r.total, 0);
});

test("amount column derives quantity x rate, zero and blanks count as zero", () => {
  resetState();
  const amount = state.columns.find(c => c.role === "amount");
  assert.equal(calculateItemValue({ quantity: 3, rate: 19.99 }, amount), 59.97);
  assert.equal(calculateItemValue({ quantity: "", rate: 5 }, amount), 0);
  assert.equal(calculateItemValue({ quantity: 2, rate: "x" }, amount), 0);
  assert.equal(calculateItemValue({ quantity: 1e9, rate: 1e3 }, amount), 1e12);
});

/* ------------------------------------------------------------ CSV import */

test("parseCSV handles quotes, doubled quotes and CRLF", () => {
  const rows = parseCSV('a,"b, c","d ""e"""\r\n1,2,3\n');
  assert.deepEqual(rows, [["a", "b, c", 'd "e"'], ["1", "2", "3"]]);
});

test("regression: spreadsheet amounts with thousands separators and symbols are imported as numbers", () => {
  resetState();
  const items = mapRows(parseCSV('SKU,Description,Qty,Rate\nA1,Widget,2,"1,234.50"\nA2,Gadget,1,£99.99\n'));
  assert.deepEqual(items.map(i => [i.quantity, i.rate]), [[2, 1234.5], [1, 99.99]]);
  assert.equal(calculateSubtotal(items, amountColumn()), 2568.99);
});

test("regression: a sheet with no quantity column gets quantity 1 (lines were priced at 0)", () => {
  resetState();
  const items = mapRows(parseCSV("SKU,Name,Royalty\nB1,Course one,12.50\nB2,Course two,7.25\n"));
  assert.equal(items[0].quantity, 1);
  assert.equal(calculateSubtotal(items, amountColumn()), 19.75);
});

test("regression: refund and fractional quantities keep the statement's line total", () => {
  resetState();
  const items = mapRows(parseCSV("SKU,Name,Qty,Royalty\nR1,Refund,-1,-5.00\nH1,Half,0.5,4.00\n"));
  const amount = state.columns.find(c => c.role === "amount");
  assert.equal(calculateItemValue(items[0], amount), -5);
  assert.equal(calculateItemValue(items[1], amount), 4);
});

test("rows with no matching cells are dropped, not turned into blank lines", () => {
  resetState();
  const items = mapRows(parseCSV("Name,Comment,Royalty\nCourse,ok,5\n,just a note,\n"));
  assert.equal(items.length, 1);
});

test("spreadsheet import keeps non-numeric text in numeric columns rather than zeroing it", () => {
  resetState();
  const items = mapRows(parseCSV("Description,Qty,Rate\nThing,2,TBC\n"));
  assert.equal(items[0].rate, "TBC");
});

/* ------------------------------------------------------------- bundles */

test("splitName handles the line-break form, the inline form and no bundle", () => {
  assert.deepEqual(splitName("Course A\n in Bundle X"), { course: "Course A", bundle: "Bundle X" });
  assert.deepEqual(splitName("Course B in Bundle Y"), { course: "Course B", bundle: "Bundle Y" });
  assert.equal(splitName("Solo").bundle, "Standalone / No bundle found");
});

test("regression: bundle prices include formatted royalty values", () => {
  const rows = extractBundleRows([
    ["SKU", "Name", "Net Qty", "Royalty"],
    ["1", "A\n in B1", "2", "£1,000.50"],
    ["2", "C\n in B1", "1", "4.50"]
  ]);
  const [summary] = getBundleSummary(rows);
  assert.equal(summary.BundlePrice, 1005);
  assert.equal(summary.NetQty, 3);
});

test("regression: bundle lines without a Net Qty column are priced at their royalty", () => {
  resetState();
  const rows = extractBundleRows([["Name", "Royalty"], ["A\n in B", "12.50"], ["C\n in B", "-2.50"]]);
  const amount = state.columns.find(c => c.role === "amount");
  assert.deepEqual(itemsFromRows(rows).map(i => calculateItemValue(i, amount)), [12.5, -2.5]);
  assert.equal(calculateItemValue(itemsFromBundles(rows)[0], amount), 10);
});

/* --------------------------------------------------- snapshot sanitising */

test("normalizeSnapshot rejects non-invoice payloads", () => {
  for (const bad of [null, 5, "x", [], { foo: 1 }]) {
    assert.throws(() => normalizeSnapshot(bad));
  }
});

test("regression: remote logo URLs are removed (they made the browser contact another server)", () => {
  const { snapshot, warnings } = normalizeSnapshot({ fields: {}, logo: "https://example.com/p.png" });
  assert.equal(snapshot.logo, "");
  assert.equal(warnings.length, 1);
  assert.ok(isSafeLogo("data:image/png;base64,AAAA"));
  assert.ok(!isSafeLogo("javascript:alert(1)"));
});

test("regression: column widths cannot carry markup and keys are made safe and unique", () => {
  const { snapshot } = normalizeSnapshot({
    columns: [
      { key: "a", label: "A", width: '"><img src=x onerror=alert(1)>', type: "evil", role: "amount" },
      { key: "a", label: "B", width: 20, role: "amount" },
      { key: "__proto__", label: "C" },
      { foo: 1 }
    ],
    items: []
  });
  assert.equal(snapshot.columns.length, 3);
  assert.equal(snapshot.columns[0].width, 10);
  assert.equal(snapshot.columns[0].type, "text");
  assert.deepEqual(snapshot.columns.map(c => c.key), ["a", "a_2", "column_3"]);
  assert.deepEqual(snapshot.columns.map(c => c.role), ["amount", "none", "none"]);
});

test("numeric cells saved as text are repaired, reported, and other values cleaned", () => {
  const { snapshot, warnings } = normalizeSnapshot({
    columns: defaultColumns(),
    items: [{ quantity: "2", rate: "1,234.50", description: "x", extra: { a: 1 } }, "junk", null]
  });
  assert.equal(snapshot.items.length, 1);
  assert.deepEqual([snapshot.items[0].quantity, snapshot.items[0].rate], [2, 1234.5]);
  assert.equal(snapshot.items[0].extra, "");
  assert.ok(warnings.some(w => w.includes("2 amounts were stored as text")));
});

test("null fields keep the current value instead of blanking it", () => {
  const { snapshot } = normalizeSnapshot({ fields: { invoiceNumber: null, reference: 12 } });
  assert.ok(!("invoiceNumber" in snapshot.fields));
  assert.equal(snapshot.fields.reference, "12");
});

test("a real serialized snapshot passes through unchanged", () => {
  const original = {
    version: 2, logo: "data:image/png;base64,AAAA", watermark: "", zoom: 0.9,
    columns: defaultColumns(),
    items: [{ sku: "A", description: "Line", quantity: 2, rate: 10, amount: "" }],
    sections: { logo: true, notes: false },
    fields: { invoiceNumber: "INV-7", currency: "GBP" }
  };
  const { snapshot, warnings } = normalizeSnapshot(JSON.parse(JSON.stringify(original)));
  assert.deepEqual(warnings, []);
  assert.deepEqual(snapshot, original);
});

/* -------------------------------------------------------------- history */

test("history stack: undo/redo, redo cleared by a new change, limit honoured", () => {
  const h = createHistoryStack({ limit: 3 });
  h.init("a");
  h.push("b");
  h.push("c");
  assert.equal(h.undo(), "b");
  h.push("d");
  assert.equal(h.canRedo(), false);
  h.push("e");
  assert.equal(h.size(), 3);
  assert.equal(h.undo(), "d");
  assert.equal(h.redo(), "e");
  assert.equal(num(h.position()), 2);
});

/* ------------------------------------------- decimal separator (per file) */

test("detectDecimalSeparator uses unambiguous values and falls back to the given locale", () => {
  assert.equal(detectDecimalSeparator(["1,234", "12,50", "3"], "."), ",");
  assert.equal(detectDecimalSeparator(["1.234,56", "7"], "."), ",");
  assert.equal(detectDecimalSeparator(["1,234", "12.5", "7.25"], ","), ".");
  assert.equal(detectDecimalSeparator(["1,234", "2,000", 5], "."), ".");
  assert.equal(detectDecimalSeparator(["1,234", "2,000"], ","), ",");
});

test("parseAmount with a known separator resolves '1,234' and '1.234' both ways", () => {
  assert.equal(parseAmount("1,234", "."), 1234);
  assert.equal(parseAmount("1,234", ","), 1.234);
  assert.equal(parseAmount("1.234", ","), 1234);
  assert.equal(parseAmount("1.234,50", ","), 1234.5);
  assert.equal(parseAmount("1.234,50", "."), null);
  assert.equal(parseAmount("12,34,5", "."), null);
});

test("regression: a decimal-comma sheet reads '1,234' as 1.234, not 1234", () => {
  resetState();
  const items = mapRows(parseCSV('Description,Qty,Rate\nA,1,"12,50"\nB,1,"1,234"\n'));
  assert.deepEqual(items.map(i => i.rate), [12.5, 1.234]);
});

test("a decimal-point sheet still reads '1,234' as 1234", () => {
  resetState();
  const items = mapRows(parseCSV('Description,Qty,Rate\nA,1,12.50\nB,1,"1,234"\n'));
  assert.deepEqual(items.map(i => i.rate), [12.5, 1234]);
});

/* ------------------------------------------ zero-quantity statement lines */

test("regression: quantity 0 with a non-zero royalty keeps the royalty (was priced at 0)", () => {
  resetState();
  const items = mapRows(parseCSV("SKU,Name,Net Qty,Royalty\nZ1,Adjustment,0,-0.50\nN1,Normal,2,10\n"));
  const amount = state.columns.find(c => c.role === "amount");
  assert.equal(items[0][FIXED_AMOUNT_KEY], -0.5);
  assert.equal(items[0].quantity, 0);
  assert.equal(calculateItemValue(items[0], amount), -0.5);
  assert.equal(FIXED_AMOUNT_KEY in items[1], false);
  assert.equal(calculateSubtotal(items, amountColumn()), 9.5);
});

test("bundle courses with net quantity 0 keep their royalty", () => {
  resetState();
  const rows = extractBundleRows([["Name", "Net Qty", "Royalty"], ["A\n in B", "0", "1.25"]]);
  const amount = state.columns.find(c => c.role === "amount");
  assert.equal(calculateItemValue(itemsFromRows(rows)[0], amount), 1.25);
});

test("the fixed-amount key survives saving and cannot be used as a column key", () => {
  const { snapshot } = normalizeSnapshot({
    columns: [{ key: FIXED_AMOUNT_KEY, label: "X" }],
    items: [{ [FIXED_AMOUNT_KEY]: 3.5 }, { [FIXED_AMOUNT_KEY]: "bad" }]
  });
  assert.notEqual(snapshot.columns[0].key, FIXED_AMOUNT_KEY);
  assert.equal(snapshot.items[0][FIXED_AMOUNT_KEY], 3.5);
  assert.equal(FIXED_AMOUNT_KEY in snapshot.items[1], false);
});

/* --------------------------------------------------- invoice numbering */

test("nextInvoiceNumber increments the trailing number and keeps padding", () => {
  assert.equal(nextInvoiceNumber("INV-1001"), "INV-1002");
  assert.equal(nextInvoiceNumber("JF2026-09"), "JF2026-10");
  assert.equal(nextInvoiceNumber("A-099"), "A-100");
  assert.equal(nextInvoiceNumber("A-999"), "A-1000");
  assert.equal(nextInvoiceNumber("Draft"), "Draft-1");
  assert.equal(nextInvoiceNumber(""), "1");
  assert.equal(nextInvoiceNumber("X-99999999999999999999"), "X-100000000000000000000");
});

/* ------------------------------------------------------------ watermark */

test("watermark page centres follow the print layout (297mm first page, 285mm after)", () => {
  assert.deepEqual(pageCentres(297), [148.5]);
  assert.deepEqual(pageCentres(250), [148.5]);
  assert.deepEqual(pageCentres(500), [148.5, 439.5]);
  assert.deepEqual(pageCentres(297 + 285 + 1), [148.5, 439.5, 724.5]);
});

test("watermark page centres on US Letter (279.4mm first page, 267.4mm after)", () => {
  assert.deepEqual(pageCentres(279.4, 279.4), [139.7]);
  assert.deepEqual(pageCentres(400, 279.4).map(v => Math.round(v * 10) / 10), [139.7, 413.1]);
});

test("regression: a remote watermark address is removed like a remote logo", () => {
  const { snapshot, warnings } = normalizeSnapshot({ fields: {}, watermark: "https://example.com/w.png" });
  assert.equal(snapshot.watermark, "");
  assert.equal(warnings.length, 1);
  assert.equal(normalizeSnapshot({ fields: {}, watermark: "data:image/png;base64,AA" }).snapshot.watermark, "data:image/png;base64,AA");
});

/* ------------------------------------------------------ UKHF Fanatical */

test("UKHF Fanatical prints dates as on the original (13-Oct-2026)", () => {
  assert.equal(ukhfDate("2026-10-13"), "13-Oct-2026");
  assert.equal(ukhfDate("2026-01-05"), "05-Jan-2026");
  assert.equal(ukhfDate(""), "\u2014");
});
