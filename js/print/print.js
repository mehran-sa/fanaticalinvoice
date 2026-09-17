/**
 * Builds the printable A4 document used by both Print and Export PDF.
 *
 * The invoice is cloned into an off-screen iframe together with the page's
 * stylesheets, so the browser receives a clean, invoice-only document and no
 * editor chrome can leak into the output.
 *
 * Stylesheet handling is the part that matters. The original application read
 * inline <style> elements only. Now that the CSS lives in external files, both
 * <style> and <link rel="stylesheet"> elements are carried across, in document
 * order, and the <link> hrefs are kept absolute so that relative url()
 * references inside the CSS - notably the embedded Nimbus Sans @font-face
 * files used by the Janets template - still resolve. Printing waits for those
 * stylesheets, then for fonts and images, before opening the dialog.
 */

import { $, qsa, fieldValue, toast } from "../utils.js";
import { PRINT_SETTLE_MS, PRINT_FONT_SETTLE_MS } from "../constants.js";
import { PRINT_OVERRIDE_CSS } from "./print-styles.js";
import { renderPreview } from "../invoice/invoice-renderer.js";

const FRAME_ID = "invoicePrintFrame";

/** Serializes the page's stylesheets as head markup for the print document. */
function collectStyleMarkup() {
  return qsa('style, link[rel="stylesheet"]').map(node => {
    if (node.tagName === "LINK") {
      // node.href is already absolute, so url() inside the file still resolves.
      return `<link rel="stylesheet" href="${node.href}">`;
    }
    return `<style>${node.textContent || ""}</style>`;
  }).join("\n");
}

/** Resolves once every stylesheet in the print document has loaded or failed. */
function stylesheetsReady(doc) {
  const links = [...doc.querySelectorAll('link[rel="stylesheet"]')];
  return Promise.all(links.map(link => {
    if (link.sheet) return Promise.resolve();
    return new Promise(resolve => {
      link.addEventListener("load", resolve, { once: true });
      link.addEventListener("error", resolve, { once: true });
    });
  }));
}

function imagesReady(doc) {
  return Promise.all([...doc.images].map(img =>
    img.complete ? Promise.resolve() : new Promise(resolve => {
      img.onload = resolve;
      img.onerror = resolve;
    })));
}

/**
 * @param {boolean} autoPrint Open the browser print dialog once ready.
 * @returns {HTMLIFrameElement|null} the temporary frame, or null on failure
 */
export function buildInvoicePrintDocument(autoPrint = true) {
  renderPreview();

  const clone = $("invoice").cloneNode(true);
  // Remove preview-only transforms and force a true A4 document.
  clone.style.transform = "none";
  clone.style.transformOrigin = "top left";
  clone.style.margin = "0";
  clone.style.boxShadow = "none";

  const old = $(FRAME_ID);
  if (old) old.remove();

  const frame = document.createElement("iframe");
  frame.id = FRAME_ID;
  frame.setAttribute("aria-hidden", "true");
  Object.assign(frame.style, {
    position: "fixed", right: "100%", bottom: "100%",
    width: "0", height: "0", border: "0", opacity: "0", pointerEvents: "none"
  });
  document.body.appendChild(frame);

  const w = frame.contentWindow;
  const doc = frame.contentDocument || w?.document;
  if (!w || !doc) {
    frame.remove();
    toast("Unable to open the print dialog in this browser.");
    return null;
  }

  const title = (fieldValue("invoiceNumber") || "Invoice").replace(/[<>]/g, "");

  doc.open();
  doc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<base href="${document.baseURI}">
<title>${title}</title>
${collectStyleMarkup()}
<style>${PRINT_OVERRIDE_CSS}</style>
</head>
<body>


</body>
</html>`);
  doc.close();

  doc.body.appendChild(doc.importNode(clone, true));

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    setTimeout(() => frame.remove(), 0);
  };

  const runPrint = () => {
    try {
      w.focus();
      if (autoPrint) w.print();
    } catch (err) {
      console.error(err);
      cleanup();
    }
  };

  // Remove the temporary frame after the print dialog closes where supported.
  w.addEventListener?.("afterprint", cleanup, { once: true });

  // Wait for stylesheets, then fonts and images, before opening the dialog.
  // The extra font settle previously lived in a separate patch script; it is
  // part of the print pipeline now.
  stylesheetsReady(doc)
    .then(() => Promise.all([
      imagesReady(doc),
      doc.fonts?.ready || Promise.resolve(),
      document.fonts?.ready || Promise.resolve()
    ]))
    .then(() => new Promise(resolve => setTimeout(resolve, PRINT_FONT_SETTLE_MS)))
    .then(() => setTimeout(runPrint, PRINT_SETTLE_MS));

  return frame;
}
