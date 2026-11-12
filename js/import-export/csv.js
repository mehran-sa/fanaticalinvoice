/** Minimal RFC-4180 style CSV reader: quoted fields, doubled quotes, CR/LF/CRLF. */

export function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"' && inQuotes && next === '"') {          // escaped quote
      cell += '"';
      i++;
    } else if (c === '"') {                               // quote boundary
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {                  // end of field
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !inQuotes) {  // end of record
      if (c === "\r" && next === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
