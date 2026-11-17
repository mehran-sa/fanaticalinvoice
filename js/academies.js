/**
 * Academies: each invoice template stands for one academy (the seller), and
 * the board, the academy picker and the top bar all name and picture an
 * invoice by it. Alison templates carry the academy's logo; the others show
 * the academy's initials.
 */

import * as TemplateRegistry from "./templates/template-registry.js";

export const GROUPS = [["alison", "Alison"], ["fanatical", "Fanatical"], ["general", "General"]];
const GROUP_OF = {
  modern: "general", multipurpose: "general",
  minimal: "fanatical", classic: "fanatical", royalty: "fanatical", ukhf: "fanatical"
};

export const groupOf = id => GROUP_OF[id] || (String(id || "").startsWith("alison-") ? "alison" : "general");
export const academyName = id => (id && TemplateRegistry.has(id) ? TemplateRegistry.get(id).name : "No template");

/** Academies whose Alison invoice has only Description and Amount columns. */
const AMOUNT_ONLY = new Set([
  "alison-adams", "alison-alpha", "alison-beauty", "alison-coursecloud", "alison-janets",
  "alison-johnacademy", "alison-knowledgegate", "alison-mayfair", "alison-studybooth"
]);
export const amountOnlyLines = id => AMOUNT_ONLY.has(id);

/** Every academy, Alison first, then Fanatical and General, by name. */
export function listAcademies() {
  const order = Object.fromEntries(GROUPS.map(([g], i) => [g, i]));
  return TemplateRegistry.list()
    .map(t => ({ id: t.id, name: t.name, group: groupOf(t.id), logoKey: t.capabilities?.brand?.logo || "" }))
    .sort((a, b) => order[a.group] - order[b.group] || a.name.localeCompare(b.name));
}

/** "Janets Alison" -> "JA". */
export function initialsOf(name) {
  const words = String(name || "").replace(/\b(Alison|Fanatical)\b/g, "").split(/\s+/).filter(w => /[A-Za-z0-9]/.test(w));
  return (words.slice(0, 2).map(w => w[0]).join("") || "?").toUpperCase();
}

let logos = null;
/** The academies' logos (data URLs), loaded the first time a picture is needed. */
export const loadAcademyLogos = async () => (logos ||= (await import("./templates/alison/logos.js")).default);
export const academyLogoNow = id => {
  const key = TemplateRegistry.get(id)?.capabilities?.brand?.logo;
  return key && logos ? logos[key] || "" : "";
};

/**
 * A small picture of the academy: its logo when it has one, otherwise its
 * initials. Returns the element at once and fills the logo in when loaded.
 */
export function academyBadge(id, { size = "m" } = {}) {
  const box = document.createElement("span");
  box.className = "academy-badge size-" + size;
  box.setAttribute("aria-hidden", "true");
  const key = TemplateRegistry.has(id) ? TemplateRegistry.get(id).capabilities?.brand?.logo : "";
  const showInitials = () => {
    box.classList.add("initials");
    box.textContent = initialsOf(academyName(id));
  };
  if (!key) {
    showInitials();
    return box;
  }
  const put = map => {
    if (!map[key]) return showInitials();
    const img = document.createElement("img");
    img.alt = "";
    img.src = map[key];
    box.replaceChildren(img);
  };
  if (logos) put(logos);
  else loadAcademyLogos().then(put).catch(showInitials);
  return box;
}
