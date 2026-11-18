/**
 * Tests for 2.14.0's invoice-board rules: quarters, statuses, the PDF file
 * name, the "line repeats the total" check, rows pasted from a spreadsheet,
 * which Drive backups are kept, and each academy's own invoice numbers.
 *
 *     node --test tests/quarters.test.mjs
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
  clear: () => store.clear()
};

const P = await import("../js/invoice/periods.js");
const { parsePastedRows, looksLikeCells } = await import("../js/import-export/paste-rows.js");
const { backupsToDelete, backupDue, backupDay } = await import("../js/cloud/backup-retention.js");
const lib = await import("../js/storage/invoice-library.js");
const backup = await import("../js/storage/backup.js");
const { defaultColumns } = await import("../js/state.js");

beforeEach(() => store.clear());

/* ------------------------------------------------------------ quarters */

test("quarters are read however they are written", () => {
  for (const text of ["Q3-2026", "Q3 2026", "Q3, 2026 Provider Payout", "Invoice for Q3 of 2026", "q3/2026"]) {
    assert.equal(P.normalizePeriod(text), "Q3-2026", text);
  }
  assert.equal(P.normalizePeriod("07082026Q2"), "", "a quarter without a year is not a period");
  assert.equal(P.normalizePeriod("Q5-2026"), "");
});

test("an invoice dated in a quarter is for the quarter before", () => {
  assert.equal(P.periodForDate("2026-11-17"), "Q3-2026");
  assert.equal(P.periodForDate("2026-01-05"), "Q4-2025");
  assert.equal(P.periodForDate("2026-07-01"), "Q2-2026");
  assert.equal(P.periodForDate("not a date"), "");
});

test("quarters move on and sort newest first", () => {
  assert.equal(P.shiftPeriod("Q3-2026", 1), "Q4-2026");
  assert.equal(P.shiftPeriod("Q4-2026", 1), "Q1-2027");
  assert.equal(P.shiftPeriod("Q1-2026", -1), "Q4-2025");
  assert.deepEqual(["Q1-2026", "Q4-2026", "Q3-2025", "x"].sort(P.comparePeriodsDesc), ["Q4-2026", "Q1-2026", "Q3-2025", "x"]);
});

test("Start next quarter rewrites quarters in text, keeping how they were written", () => {
  assert.equal(P.rollPeriodText("Q3-2026 earnings", "Q4-2026"), "Q4-2026 earnings");
  assert.equal(P.rollPeriodText("Q3, 2026 Provider Payout (Alison)", "Q4-2026"), "Q4, 2026 Provider Payout (Alison)");
  assert.equal(P.rollPeriodText("Royalties Q4 2026 and Q4 2026", "Q1-2027"), "Royalties Q1 2027 and Q1 2027");
  assert.equal(P.rollPeriodText("Opening balance", "Q4-2026"), "Opening balance");
  assert.equal(P.rollPeriodText(12.5, "Q4-2026"), 12.5, "numbers are left alone");
});

test("an invoice's quarter: set by hand, else from its lines, else from its date", () => {
  const items = [{ description: "Opening balance" }, { description: "Q2-2026 earnings" }];
  assert.equal(P.invoicePeriod({ fields: { invoicePeriod: "Q1 2026" }, items }), "Q1-2026");
  assert.equal(P.invoicePeriod({ fields: { invoiceDate: "2026-11-17" }, items }), "Q2-2026");
  assert.equal(P.invoicePeriod({ fields: { invoiceDate: "2026-11-17" }, items: [] }), "Q3-2026");
});

test("an invoice is a draft or issued: no Paid or Overdue (payments are not tracked)", () => {
  assert.equal(P.effectiveStatus({ status: "issued", dueDate: "2026-11-01" }), "issued");
  assert.equal(P.effectiveStatus({ status: "paid", dueDate: "2026-11-01" }), "issued");
  assert.equal(P.effectiveStatus({ status: "draft", dueDate: "2026-11-01" }), "draft");
  assert.equal(P.effectiveStatus({ dueDate: "2026-11-30" }), "issued");
  assert.deepEqual(P.STATUSES, ["draft", "issued"]);
  assert.ok(!("paid" in P.STATUS_LABELS) && !("overdue" in P.STATUS_LABELS));
});

test("the PDF is named by academy, number and quarter", () => {
  assert.equal(P.pdfFileName({ academy: "Janets Alison", number: "2026-11005", period: "Q3-2026" }), "Janets-Alison_2026-11005_Q3-2026");
  assert.equal(P.pdfFileName({ academy: "Institute of Beauty & Makeup Alison", number: "IBM/07", period: "Q3-2026" }),
    "Institute-of-Beauty-and-Makeup-Alison_IBM-07_Q3-2026");
  assert.equal(P.pdfFileName({ academy: "Janets Alison", number: "#2026-11005", period: "" }, "number"), "2026-11005");
  assert.equal(P.pdfFileName({ academy: "", number: "", period: "" }), "Invoice");
});

test("a closing balance typed as a line is found; ordinary equal lines are not", () => {
  const lines = [
    { description: "Opening balance", amount: 2254.64 },
    { description: "Q3-2026 earnings", amount: 1993.71 },
    { description: "Closing balance", amount: 4248.35 }
  ];
  assert.deepEqual(P.linesRepeatingTotal(lines), [2]);
  assert.deepEqual(P.linesRepeatingTotal([{ description: "Course A", amount: 50 }, { description: "Course B", amount: 50 }]), []);
  assert.deepEqual(P.linesRepeatingTotal([{ description: "Earnings", amount: 50 }, { description: "Total", amount: 50 }]), [1]);
  assert.deepEqual(P.linesRepeatingTotal([{ description: "Only", amount: 10 }]), []);
});

/* ------------------------------------------------------- pasted rows */

test("rows pasted from Excel become lines; a heading row is skipped", () => {
  const rows = parsePastedRows("Description\tAmount\r\nOpening balance\t2,254.64\r\nQ3-2026 earnings\t€1,993.71\r\n\r\n");
  assert.deepEqual(rows, [
    { description: "Opening balance", quantity: null, rate: null, amount: 2254.64 },
    { description: "Q3-2026 earnings", quantity: null, rate: null, amount: 1993.71 }
  ]);
  assert.ok(looksLikeCells("a\tb") && !looksLikeCells("one line\nanother"));
});

test("pasted numbers: quantity and amount, rate and amount, or quantity, rate and amount", () => {
  assert.deepEqual(parsePastedRows("Course\t3\t60")[0], { description: "Course", quantity: 3, rate: null, amount: 60 });
  assert.deepEqual(parsePastedRows("Course\t12.5\t25")[0], { description: "Course", quantity: null, rate: 12.5, amount: 25 });
  assert.deepEqual(parsePastedRows("SKU-1\tCourse\t2\t10\t20")[0], { description: "SKU-1 Course", quantity: 2, rate: 10, amount: 20 });
  assert.deepEqual(parsePastedRows("Course\t1.234,50")[0].amount, 1234.5, "decimal commas");
});

/* ----------------------------------------------------- Drive backups */

const b = (id, day, time = "09:00:00") => ({ id, name: `${day} Backup.json`, createdTime: `${day}T${time}Z` });

test("tidy keeps every backup from the latest day, one per day for 30 days, one per month for a year", () => {
  const list = [];
  // 60 days of daily backups, plus a second one on the latest day.
  for (let i = 0; i < 60; i++) {
    const d = new Date(Date.UTC(2026, 10, 17) - i * 864e5).toISOString().slice(0, 10);
    list.push(b("d" + i, d));
  }
  list.push({ id: "manual", name: "2026-11-17 15.40 Backup.json", createdTime: "2026-11-17T15:40:00Z" });
  const gone = new Set(backupsToDelete(list, "tidy"));
  assert.ok(!gone.has("manual") && !gone.has("d0"), "both of today's backups stay");
  for (let i = 1; i < 30; i++) assert.ok(!gone.has("d" + i), "day " + i + " stays");
  assert.ok(gone.has("d40"), "an old daily backup goes");
  // The newest backup of each older month stays (Sep 2026: the 30th).
  assert.ok(!gone.has(list.find(x => x.name.startsWith("2026-09-30")).id));
  assert.deepEqual(backupsToDelete(list, "all"), []);
  assert.equal(backupDay({ name: "x.json", createdTime: "2026-01-02T00:00:00Z" }), "2026-01-02");
});

test("an automatic backup is due once a day, or once a week", () => {
  const now = new Date(2026, 10, 17, 15, 0).getTime();
  assert.equal(backupDue("", "daily", "2026-11-17", now), true);
  assert.equal(backupDue(new Date(2026, 10, 17, 9, 0).toISOString(), "daily", "2026-11-17", now), false);
  assert.equal(backupDue(new Date(2026, 10, 16, 23, 0).toISOString(), "daily", "2026-11-17", now), true);
  assert.equal(backupDue(new Date(2026, 10, 14).toISOString(), "weekly", "2026-11-17", now), false);
  assert.equal(backupDue(new Date(2026, 10, 9).toISOString(), "weekly", "2026-11-17", now), true);
  assert.equal(backupDue("", "off", "2026-11-17", now), false);
});

/* ------------------------------------------- academies' own numbers */

const snap = (number, template, extra = {}) => ({
  version: 2, logo: "", zoom: 1, columns: defaultColumns(),
  items: [{ description: "Q3-2026 earnings", quantity: 1, rate: 10 }], sections: {},
  fields: { invoiceNumber: number, template, invoiceDate: "2026-11-05", dueDate: "2026-11-20", currency: "EUR", ...extra }
});
const save = (id, number, template, extra) => {
  const data = snap(number, template, extra);
  lib.saveInvoiceRecord(id, data, { number, client: "Alison", invoiceDate: "2026-11-05", total: 10, currency: "EUR", ...lib.summaryDetails(data) });
};

test("each academy keeps its own invoice numbers", () => {
  save("a1", "1001", "alison-janets");
  save("b1", "1001", "alison-apex");
  assert.equal(lib.invoicesWithNumber("1001", "zz", "alison-janets").length, 1);
  assert.equal(lib.invoicesWithNumber("1001", "a1", "alison-janets").length, 0, "Apex's 1001 does not clash with Janets'");
  assert.equal(lib.invoicesWithNumber("1001", "zz").length, 2, "without an academy every invoice counts");
});

test("the index carries academy, status and quarter; old entries are filled in once", () => {
  save("a1", "1001", "alison-janets", { invoiceStatus: "issued", companyName: "Edujanets Ltd.\nLine 2" });
  const entry = lib.listInvoices()[0];
  assert.equal(entry.template, "alison-janets");
  assert.equal(entry.status, "issued");
  assert.equal(entry.period, "Q3-2026");
  assert.equal(entry.company, "Edujanets Ltd.");
  // An index written before 2.14.0 has none of these.
  const raw = JSON.parse(store.get("invoiceStudio.invoiceIndex.v1"));
  store.set("invoiceStudio.invoiceIndex.v1", JSON.stringify(raw.map(({ template, company, dueDate, status, paidDate, period, ...old }) => old)));
  assert.equal(lib.listInvoices()[0].template, "");
  assert.equal(lib.fillMissingSummaries(), 1);
  assert.equal(lib.listInvoices()[0].template, "alison-janets");
  assert.equal(lib.fillMissingSummaries(), 0, "only once");
});

test("restoring a backup by hand brings back an invoice deleted since, so sync keeps it", () => {
  save("a1", "1001", "alison-janets");
  const copy = backup.buildBackup();
  lib.deleteInvoiceRecord("a1");
  assert.ok(lib.readDeletedInvoices().a1);
  backup.restoreBackup(copy, { revive: true });
  assert.equal(lib.listInvoices().length, 1);
  assert.equal(lib.readDeletedInvoices().a1, undefined, "the deletion record is cleared");
  assert.ok(lib.listInvoices()[0].updatedAt > lib.listInvoices()[0].invoiceDate, "saved as changed now");
  assert.equal(lib.listInvoices()[0].template, "alison-janets", "board details come back too");
});

/* ------------------------------------------ Alison Statement Grabber */

const { parseAlisonStatement, looksLikeStatement } = await import("../js/import-export/alison-statement.js");
const SAMPLE = " Q2-2026 Payout \n\n\n\nOpening Balance: €29,000.00\nQ2-2026 Earnings: €8,200.77\n\n*Less Publishing Costs Recouped: €0.00\nClosing Balance: €37,200.77\n\n\nProposed Payment: €37,200.77\n";

test("an Alison payout statement is read: lines, the quarter, and its totals", () => {
  assert.ok(looksLikeStatement(SAMPLE));
  assert.ok(!looksLikeStatement("Course\t10\nOther\t5"), "spreadsheet cells are not a statement");
  const s = parseAlisonStatement(SAMPLE);
  assert.equal(s.period, "Q2-2026");
  assert.equal(s.currency, "EUR");
  assert.deepEqual(s.lines.map(l => [l.label, l.amount]), [
    ["Opening Balance", 29000], ["Q2-2026 Earnings", 8200.77], ["Less Publishing Costs Recouped", 0]
  ]);
  assert.deepEqual([s.quarter.label, s.quarter.amount], ["Q2-2026 Earnings", 8200.77]);
  assert.equal(s.check.label, "Proposed Payment");
  assert.equal(s.sum, 37200.77, "the lines add up to the proposed payment");
  assert.ok(s.rows.filter(r => r.kind === "total").length === 2, "closing balance and proposed payment are totals, not lines");
});

test("a deduction on a statement is taken off", () => {
  const s = parseAlisonStatement("Q3-2026 Payout\nOpening Balance: €100.00\nQ3-2026 Earnings: €50.00\nLess Publishing Costs Recouped: €20.00\nProposed Payment: €130.00");
  assert.equal(s.lines[2].amount, -20);
  assert.equal(s.sum, 130);
  assert.equal(parseAlisonStatement("Q3 2026 statement\nEarnings: 1.234,50 EUR\nTotal: 1.234,50 EUR").lines[0].amount, 1234.5, "decimal commas");
});
