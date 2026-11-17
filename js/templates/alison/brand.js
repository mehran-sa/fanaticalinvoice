/**
 * Filling in an academy's details when its Alison template is chosen: company
 * name and address, logo, bank and PayPal details, currency, and Alison as the
 * client, as on that academy's original invoice. Only a choice made in the
 * Design menu does this; opening a saved invoice never does. Ctrl+Z undoes it.
 */

import { setFieldValue, toast } from "../../utils.js";
import { applyBrand } from "../../session.js";
import { academyDetails } from "../../secure/academy-details.js";

/** Company and client fields a brand replaces (cleared when it has no value). */
const COMPANY_FIELDS = ["companyName", "companyReg", "companyVat", "companyAddress", "companyPhone", "companyEmail", "companyWebsite", "paymentDetails", "terms"];
const CLIENT_FIELDS = ["clientName", "clientAddress", "clientContact", "clientEmail", "clientTax"];

let logos = null;
/** The logos are loaded only when an Alison template is first chosen. */
const loadLogos = async () => (logos ||= (await import("./logos.js")).default);

export async function applyTemplateBrand(template) {
  const logoOnly = template?.capabilities?.brand;
  if (!logoOnly) return false;
  // The details are encrypted (js/secure/vault.js) and opened by the master password.
  const brand = { ...logoOnly, ...(academyDetails(template.id) || {}) };
  const images = brand.logo ? await loadLogos() : {};
  applyBrand(() => {
    for (const id of COMPANY_FIELDS) setFieldValue(id, brand.fields?.[id] ?? "");
    for (const id of CLIENT_FIELDS) setFieldValue(id, brand.client?.[id] ?? "");
    if (brand.fields?.currency) setFieldValue("currency", brand.fields.currency);
    return { logo: images[brand.logo] || "" };
  });
  toast(`${template.name}: ${brand.fields?.companyName || "the brand"}'s details, logo and payment details are filled in, with Alison as the client. Press Ctrl+Z to undo.`);
  return true;
}
