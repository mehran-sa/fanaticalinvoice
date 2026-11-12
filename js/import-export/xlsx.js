/**
 * Excel import.
 *
 * Parsing happens in a dedicated Web Worker (xlsx-worker.js) that loads the
 * bundled SheetJS parser from js/vendor. Nothing is fetched from the internet.
 * Running the parser off the page isolates it from the application: a crafted
 * file cannot alter the page's objects, a parse that runs too long is stopped,
 * and the worker is discarded after each file so its memory is released.
 *
 * The single-file build (SA-Invoice-Generator.html) supplies the worker source
 * inline as globalThis.SA_XLSX_WORKER_SOURCE, because a page opened from disk
 * cannot start a worker from a file path.
 */

import { XLSX_WORKER_SRC, XLSX_PARSE_TIMEOUT_MS } from "../constants.js";

function startWorker() {
  const inline = globalThis.SA_XLSX_WORKER_SOURCE;
  if (typeof inline === "string") {
    const url = URL.createObjectURL(new Blob([inline], { type: "text/javascript" }));
    const worker = new Worker(url);
    return { worker, release: () => URL.revokeObjectURL(url) };
  }
  return { worker: new Worker(XLSX_WORKER_SRC), release: () => {} };
}

/** Rows from the worker are re-checked: arrays of text, numbers or booleans. */
const cleanRows = rows => (Array.isArray(rows) ? rows : []).map(row =>
  (Array.isArray(row) ? row : []).map(v =>
    (typeof v === "number" || typeof v === "string" || typeof v === "boolean" ? v : "")));

/** Reads the first worksheet of a workbook as an array of rows. */
export async function readWorkbookRows(file) {
  const buffer = await file.arrayBuffer();
  let started;
  try {
    started = startWorker();
  } catch {
    throw Error("The Excel reader could not be started in this browser. Import a CSV file instead.");
  }
  const { worker, release } = started;

  return new Promise((resolve, reject) => {
    const finish = (fn, value) => {
      clearTimeout(timer);
      worker.terminate();
      release();
      fn(value);
    };
    const timer = setTimeout(() => finish(reject,
      Error(`"${file.name}" took too long to read and was stopped. Try saving it as CSV.`)), XLSX_PARSE_TIMEOUT_MS);

    worker.onmessage = ({ data }) => {
      if (data && Array.isArray(data.rows)) return finish(resolve, cleanRows(data.rows));
      if (data && data.error === "noSheet") return finish(reject, Error(`"${file.name}" does not contain a worksheet.`));
      finish(reject, Error(`"${file.name}" could not be read as a spreadsheet.`));
    };
    worker.onerror = event => {
      event.preventDefault?.();
      finish(reject, Error("The Excel reader could not be loaded. Check that js/vendor/xlsx.full.min.js is present, or import a CSV file instead."));
    };
    // The buffer is transferred, not copied.
    worker.postMessage({ buffer }, [buffer]);
  });
}
