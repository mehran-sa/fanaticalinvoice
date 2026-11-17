/**
 * The academies' company, bank and PayPal details, once the master password
 * has opened the vault (js/secure/lock.js). Kept in memory only.
 */

let academies = {};

export function setAcademyDetails(details) {
  academies = details && typeof details.academies === "object" ? details.academies : {};
}

/** {fields, client} for an academy (template id), or null. */
export const academyDetails = id => academies[id] || null;
