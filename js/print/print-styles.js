/**
 * Print-only CSS injected into the generated print document.
 *
 * Taken verbatim from the original application. These rules must stay last in
 * the print document's cascade: they use the PDF page box as the source of
 * truth and pin the invoice to A4 regardless of preview zoom.
 */

/**
 * The print CSS for a paper size ({width, height} in mm). A4 unless the
 * template says otherwise (UKHF Fanatical prints on US Letter, as its original).
 * Pages after the first have a 12mm top margin. A template can also ask for a
 * bottom margin on every page (capabilities.printMargins.bottom, mm); Modern
 * and Multipurpose use 12mm so long tables never run to the paper's edge.
 */
export const printOverrideCss = ({ width = 210, height = 297 } = {}, { bottom = 0 } = {}) => `
    /* Use the PDF page box as the source of truth. This prevents the document
       from growing wider than A4 and removes the extra strip on the right. */
    @page {
      size: ${width}mm ${height}mm;
      margin: 12mm 0 ${bottom}mm 0;
    }
    @page :first {
      margin-top: 0;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      width: 100% !important;
      max-width: ${width}mm !important;
      background: #fff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      overflow-x: hidden !important;
      overflow-y: visible !important;
    }
    .invoice {
      width: 100% !important;
      max-width: ${width}mm !important;
      min-height: ${height - bottom}mm !important;
      height: auto !important;
      margin: 0 !important;
      box-shadow: none !important;
      transform: none !important;
      transform-origin: top left !important;
      overflow: visible !important;
      break-after: auto !important;
      page-break-after: auto !important;
    }
    .invtable {
      width: 100% !important;
      table-layout: fixed !important;
      border-spacing: 0 !important;
    }
    .invtable thead { display: table-header-group !important; }
    .invtable tr {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }
    .invtable th,
    .invtable td {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .topdetails,
    .inv-header,
    .billrow,
    .balance,
    .summary,
    .notebox,
    .companywrap {
      break-inside: avoid !important;
      page-break-inside: avoid !important;
    }

    /* Janets: payment details belong on a clean second page. */
    .invoice.template-minimal .paymentgrid:not(.section-hidden) {
      break-before: page !important;
      page-break-before: always !important;
      min-height: 0 !important;
      padding-top: 0 !important;
      margin-top: 0 !important;
    }

    /* Alpha/Fanatical and One Education: allow content to flow naturally. */
    .invoice.template-royalty .paymentgrid,
    .invoice.template-classic .paymentgrid {
      break-before: auto !important;
      page-break-before: auto !important;
    }
    /* The supplied One Education PDF continues a row across the page break and
       does not repeat the table heading on page two. */
    .invoice.template-classic .invtable thead { display: table-row-group !important; }
    .invoice.template-classic .invtable tr {
      break-inside: auto !important;
      page-break-inside: auto !important;
    }

    /* Hide any controls accidentally nested inside invoice content. */
    button, input, select, textarea {
      display: none !important;
    }

    @media print {
      html, body { width: 100% !important; max-width: ${width}mm !important; }
      .invoice { width: 100% !important; max-width: ${width}mm !important; }
    }
  `;

/** A4 print CSS (kept for anything that imported the constant). */
export const PRINT_OVERRIDE_CSS = printOverrideCss();
