/**
 * "Who is this invoice from?": the academy picker.
 *
 * New invoice opens it instead of a blank form: search, the academies used
 * most recently first, then every academy as a logo tile, grouped Alison,
 * Fanatical and General. Choosing one starts its next invoice from its last
 * one (see documents.startInvoiceFor); an academy with no invoices yet starts
 * blank in its own template, with its details filled in.
 *
 * The academy button in the top bar opens the same picker to change the open
 * invoice's academy (its template and, for Alison, its details).
 */

import { $, fieldValue, toast } from "../utils.js";
import { listAcademies, academyBadge, GROUPS, loadAcademyLogos } from "../academies.js";
import { listInvoices } from "../storage/invoice-library.js";
import { startInvoiceFor, newInvoice, latestInvoiceFor } from "../documents.js";
import { applyTemplateBrand } from "../templates/alison/brand.js";
import { shiftPeriod, periodForDate } from "../invoice/periods.js";
import { today } from "../utils.js";
import { dateFmt } from "../invoice/formatters.js";
import * as TemplateRegistry from "../templates/template-registry.js";

let mode = "new";
let afterChoose = null;

/** Academies by how recently they were invoiced. */
function recentAcademies(limit = 6) {
  const seen = [];
  for (const entry of listInvoices()) {
    if (entry.template && TemplateRegistry.has(entry.template) && !seen.includes(entry.template)) seen.push(entry.template);
    if (seen.length >= limit) break;
  }
  return seen;
}

function tile(academy) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "academy-tile" + (mode === "change" && academy.id === fieldValue("template") ? " current" : "");
  button.dataset.academy = academy.id;
  const last = latestInvoiceFor(academy.id);
  const name = document.createElement("span");
  name.className = "tile-name";
  name.textContent = academy.name;
  const sub = document.createElement("span");
  sub.className = "tile-sub";
  if (mode === "change") {
    sub.textContent = academy.id === fieldValue("template") ? "This invoice's academy" : academy.group === "alison" ? "Fills in its details and bank" : "Changes the design";
  } else if (last) {
    const next = shiftPeriod(last.period, 1) || periodForDate(today());
    sub.textContent = `Continues from ${last.number || "its last invoice"}${last.period ? " (" + last.period + ")" : ""}, for ${next}`;
  } else {
    sub.textContent = academy.group === "alison" ? "No invoices yet: starts with its details filled in" : "No invoices yet";
  }
  button.append(academyBadge(academy.id, { size: "l" }), name, sub);
  button.setAttribute("aria-label", `${academy.name}. ${sub.textContent}`);
  button.onclick = () => choose(academy.id);
  return button;
}

function render() {
  const body = $("pickerBody");
  const query = ($("pickerSearch").value || "").trim().toLowerCase();
  const academies = listAcademies();
  const matches = query ? academies.filter(a => a.name.toLowerCase().includes(query) || a.id.includes(query)) : academies;
  const sections = [];
  const recent = query ? [] : recentAcademies();
  if (recent.length && mode === "new") sections.push(["Recent", academies.filter(a => recent.includes(a.id)).sort((a, b) => recent.indexOf(a.id) - recent.indexOf(b.id))]);
  for (const [group, label] of GROUPS) {
    const list = matches.filter(a => a.group === group);
    if (list.length) sections.push([label, list]);
  }
  if (!sections.length) {
    const empty = document.createElement("p");
    empty.className = "picker-empty";
    empty.textContent = `No academy matches "${$("pickerSearch").value.trim()}".`;
    body.replaceChildren(empty);
    return;
  }
  body.replaceChildren(...sections.map(([label, list]) => {
    const section = document.createElement("section");
    section.className = "picker-group";
    const h = document.createElement("h3");
    h.textContent = label;
    const grid = document.createElement("div");
    grid.className = "picker-grid";
    grid.append(...list.map(tile));
    section.append(h, grid);
    return section;
  }));
}

async function choose(id) {
  const dialog = $("pickerDialog");
  dialog.close();
  if (mode === "change") {
    if (id === fieldValue("template")) return;
    const select = $("template");
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    afterChoose?.();
    return;
  }
  const result = startInvoiceFor(id);
  if (result.from) {
    toast(`${TemplateRegistry.get(id).name} invoice ${result.number} for ${result.period} started from ${result.from.number}${result.from.invoiceDate ? " (" + dateFmt(result.from.invoiceDate) + ")" : ""}. Check the amounts.`);
  } else {
    const template = TemplateRegistry.get(id);
    if (template?.capabilities?.brand) await applyTemplateBrand(template);
    else toast(`New ${template?.name || ""} invoice ${result.number} started.`);
  }
  afterChoose?.();
  setTimeout(() => $("addItemBtn") && document.querySelector("#itemsEditor [data-key]")?.focus(), 50);
}

/**
 * Opens the picker.
 * @param {"new"|"change"} how new: start an invoice; change: the open invoice's academy
 */
export function openPicker(how = "new") {
  mode = how;
  const dialog = $("pickerDialog");
  $("pickerTitle").textContent = how === "change" ? "Change the academy" : "Who is this invoice from?";
  $("pickerSub").textContent = how === "change"
    ? "The invoice takes that academy's design. Alison academies also fill in their company, bank and PayPal details."
    : "Choose the academy. Its next invoice continues from its last one.";
  $("pickerBlankBtn").closest(".picker-foot").hidden = how === "change";
  $("pickerSearch").value = "";
  render();
  if (!dialog.open) dialog.showModal();
  $("pickerSearch").focus();
  // Logos load the first time; tiles show initials until then.
  loadAcademyLogos().catch(() => {});
}

export function initPicker({ onChosen } = {}) {
  afterChoose = onChosen || null;
  const dialog = $("pickerDialog");
  if (!dialog) return;
  $("pickerSearch").addEventListener("input", render);
  $("pickerSearch").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      const first = $("pickerBody").querySelector(".academy-tile");
      if (first) { e.preventDefault(); first.click(); }
    }
  });
  $("pickerClose").onclick = () => dialog.close();
  $("pickerBlankBtn").onclick = () => {
    dialog.close();
    newInvoice({ blank: true });
    afterChoose?.();
  };
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
}
