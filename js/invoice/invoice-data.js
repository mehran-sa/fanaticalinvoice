/**
 * Reads the editor form into invoice data: address blocks, payment details,
 * and the serialized snapshot used for autosave, JSON export and the template
 * library.
 */

import { joinMetaLines, trimmedField, fieldValue, escapeRegExp } from "../utils.js";
import {
  COMPANY_META_FALLBACK, CLIENT_META_FALLBACK, DATA_VERSION, FIELD_IDS, BRAND_FIELD_IDS
} from "../constants.js";
import { state } from "../state.js";

const COMPANY_META_ROWS = [
  ["companyReg", "Registration: "],
  ["companyVat", "VAT / Tax: "],
  ["companyAddress", ""],
  ["companyPhone", "Phone: "],
  ["companyEmail", "Email: "],
  ["companyWebsite", ""]
];

/** One Education prints the address block without field prefixes. */
const ONE_EDUCATION_COMPANY_META_ROWS = [
  ["companyAddress", ""],
  ["companyPhone", ""],
  ["companyEmail", ""],
  ["companyWebsite", ""]
];

const CLIENT_META_ROWS = [
  ["clientContact", ""],
  ["clientTax", "VAT / Tax: "],
  ["clientAddress", ""],
  ["clientEmail", ""]
];

export const metaCompany = () => joinMetaLines(COMPANY_META_ROWS) || COMPANY_META_FALLBACK;
export const oneEducationCompanyMeta = () =>
  joinMetaLines(ONE_EDUCATION_COMPANY_META_ROWS) || COMPANY_META_FALLBACK;
export const metaClient = () => joinMetaLines(CLIENT_META_ROWS) || CLIENT_META_FALLBACK;

/** Labels the One Education payment box recognises without a colon separator. */
const ONE_EDUCATION_PAYMENT_LABELS = [
  "Account Name", "Account Number", "Bank Name", "Bank Branch",
  "Sort Code", "BIC", "IBAN", "Paypal"
];

/**
 * Splits free-text payment details into key/value rows for the One Education
 * bordered table. Lines with no recognisable key render full width.
 * @param {string} text
 * @returns {Array<{key: string, value: string}>}
 */
export function oneEducationPaymentRows(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      for (const label of ONE_EDUCATION_PAYMENT_LABELS) {
        const re = new RegExp("^" + escapeRegExp(label) + "\\s*:?[\\s\t-]*(.*)$", "i");
        const match = line.match(re);
        if (match) return { key: label, value: (match[1] || "").trim() };
      }
      const colon = line.indexOf(":");
      if (colon > 0) return { key: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() };
      return { key: "", value: line };
    });
}

/** Full snapshot of the invoice: autosave, JSON export and saved templates. */
export function serialize() {
  const fields = {};
  FIELD_IDS.forEach(id => { fields[id] = fieldValue(id); });
  return {
    version: DATA_VERSION,
    logo: state.logo,
    watermark: state.watermark,
    zoom: state.zoom,
    columns: state.columns,
    items: state.items,
    sections: state.sections,
    fields,
    // Which saved invoice this is. Ignored when a snapshot is applied (see
    // session.applySnapshot); read only when the autosave is restored.
    invoiceId: state.invoiceId
  };
}

/** Snapshot of reusable seller identity and visual setup only. */
export function serializeBrand() {
  const fields = {};
  BRAND_FIELD_IDS.forEach(id => { fields[id] = fieldValue(id); });
  // Brands carry their own watermark too: agencies invoice under several brands.
  return { version: DATA_VERSION, logo: state.logo, watermark: state.watermark, fields };
}

/** Invoice note, with the known Alpha statement typo repaired for that template. */
const NOTE_TYPO_PATTERN = /\bbank detailsfor payment\b/i;
const NOTE_TYPO_REPLACE = /\bbank detailsfor payment\b/gi;
const NOTE_TYPO_FIX = "bank details for payment";

/**
 * Two regexes are used deliberately: a /g/ regex keeps lastIndex state between
 * test() calls, so the check and the replacement cannot share one.
 * Returns the note text, and whether it was rewritten.
 */
export function readNotes(repairTypo) {
  const text = trimmedField("notes");
  if (repairTypo && NOTE_TYPO_PATTERN.test(text)) {
    return { text: text.replace(NOTE_TYPO_REPLACE, NOTE_TYPO_FIX), repaired: true };
  }
  return { text, repaired: false };
}

/**
 * The invoice number with its trailing number increased by one, keeping any
 * zero padding: "INV-1001" -> "INV-1002", "JF2026-09" -> "JF2026-10",
 * "A-099" -> "A-100". A number with no digits at the end gets "-1" added, and
 * an empty number becomes "1".
 * @param {string} current
 */
export function nextInvoiceNumber(current) {
  const text = String(current ?? "").trim();
  if (!text) return "1";
  const match = text.match(/^(.*?)(\d+)$/);
  if (!match) return text + "-1";
  const [, prefix, digits] = match;
  const next = (BigInt(digits) + 1n).toString();
  return prefix + next.padStart(digits.length, "0");
}
