/**
 * CSV output for the two bundle views. Column order, quoting, the trailing
 * total row and the UTF-8 BOM match the standalone tool exactly, so previously
 * exported files stay comparable.
 */

import { getBundleSummary, getTotalPrice } from "./bundle-rows.js";

export const CSV_MIME = "text/csv;charset=utf-8;";
/** Excel needs the byte order mark to read UTF-8 correctly. */
const BOM = "\uFEFF";

const csvEscape = v => `"${String(v ?? "").replaceAll('"', '""')}"`;
const line = cells => cells.map(csvEscape).join(",");

/** One row per course, with its bundle. */
export function buildSplitCSV(rows) {
  return BOM + [
    line(["SKU", "Course Name", "Bundle Name", "Net Qty", "Royalty"]),
    ...rows.map(r => line([r.SKU, r.CourseName, r.Bundle, r.NetQty, r.Royalty]))
  ].join("\n");
}

/** One row per bundle, plus a total row. */
export function buildSummaryCSV(rows) {
  const summary = getBundleSummary(rows);
  return BOM + [
    line(["Bundle Name", "Bundle Price"]),
    ...summary.map(r => line([r.Bundle, r.BundlePrice.toFixed(2)])),
    line(["Total Price", getTotalPrice(summary).toFixed(2)])
  ].join("\n");
}
