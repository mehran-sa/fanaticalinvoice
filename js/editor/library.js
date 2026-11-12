/**
 * Brand and template library UI.
 *
 * Persistence lives in storage/template-library.js and storage/brand-library.js;
 * this module only renders the lists and wires the buttons.
 */

import { $, toast, toastError } from "../utils.js";
import { confirmAction, promptText } from "../ui/confirm-dialog.js";
import { serialize, serializeBrand } from "../invoice/invoice-data.js";
import { listTemplates, writeTemplates, getTemplate, findTemplateIndexByName } from "../storage/template-library.js";
import { listBrands, writeBrands, getBrand, applyBrandRecord } from "../storage/brand-library.js";
import { applySnapshot, applyBrand } from "../session.js";

/** The two libraries differ only in wording and handlers. */
const KINDS = {
  template: {
    title: "Templates",
    emptyText: "No templates saved",
    removeLabel: "Delete",
    load: i => loadTemplate(i),
    remove: i => deleteTemplate(i)
  },
  brand: {
    title: "Brands",
    emptyText: "No brands saved",
    removeLabel: "Remove",
    load: i => loadBrand(i),
    remove: i => deleteBrand(i)
  }
};

const libraryButton = (label, className, onClick) => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.onclick = onClick;
  return button;
};

export function renderLibraryList(root, items, type) {
  if (!root) return;
  const kind = KINDS[type];
  root.innerHTML = "";

  const title = document.createElement("div");
  title.className = "library-title";
  title.textContent = kind.title;
  root.appendChild(title);

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "library-empty";
    empty.textContent = kind.emptyText;
    root.appendChild(empty);
    return;
  }

  const list = document.createElement("div");
  list.className = "library-list";
  items.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "library-item";
    const name = document.createElement("div");
    name.className = "library-name";
    name.textContent = entry.name;
    row.append(name, libraryButton("Load", "btn small", () => kind.load(i)));
    row.appendChild(libraryButton(kind.removeLabel, "btn small danger", () => kind.remove(i)));
    list.appendChild(row);
  });
  root.appendChild(list);
}

export function refreshLibraries() {
  renderLibraryList($("savedTemplates"), listTemplates(), "template");
  renderLibraryList($("savedBrands"), listBrands(), "brand");
}

/* ------------------------------------------------------------ templates */

export function loadTemplate(index) {
  const entry = getTemplate(index);
  if (!entry) return;
  try {
    const warnings = applySnapshot(JSON.parse(JSON.stringify(entry.data)));
    toast("Template loaded: " + entry.name + (warnings.length ? " (with corrections)" : ""));
  } catch (err) {
    console.error("[SA Invoice Generator] template could not be loaded:", err);
    toastError(`Template "${entry.name}" could not be loaded. The current invoice was not changed.`);
  }
}

export async function deleteTemplate(index) {
  const entry = listTemplates()[index];
  if (!entry) return;
  const ok = await confirmAction({
    title: "Delete template?",
    message: `The template "${entry.name}" will be deleted. Invoices made from it are not changed. This cannot be undone.`,
    confirmLabel: "Delete template",
    danger: true
  });
  if (!ok) return;
  // Re-read: another tab may have changed the list while the dialog was open.
  const list = listTemplates();
  const at = list.findIndex(t => t.name === entry.name);
  if (at === -1) return refreshLibraries();
  list.splice(at, 1);
  if (!writeTemplates(list)) return toastError("Could not update the template library.");
  refreshLibraries();
  toast("Template deleted: " + entry.name);
}

/** Uses the <dialog> overwrite prompt where available, falling back to confirm(). */
function promptTemplateOverwrite(existingName, onOverwrite) {
  const dialog = $("templateOverwriteDialog");
  const message = $("templateOverwriteMessage");
  if (!dialog || typeof dialog.showModal !== "function") {
    if (confirm(`A template named "${existingName}" already exists.

Overwrite it?`)) onOverwrite();
    else toast("Template save cancelled");
    return;
  }
  message.textContent = `A template named "${existingName}" already exists. Do you want to replace it with the current invoice settings?`;
  dialog.returnValue = "";
  $("templateOverwriteCancel").onclick = () => dialog.close("cancel");
  $("templateOverwriteConfirm").onclick = () => dialog.close("overwrite");
  dialog.onclose = () => {
    dialog.onclose = null;
    if (dialog.returnValue === "overwrite") onOverwrite();
    else toast("Template save cancelled");
  };
  dialog.showModal();
}

async function saveTemplate() {
  const name = await promptText({
    title: "Save as template",
    message: "A template keeps this whole invoice (details, items, columns and design) so you can load it again later.",
    label: "Template name",
    placeholder: "For example: Monthly royalty invoice",
    confirmLabel: "Save template",
    validate: text => (text ? "" : "Enter a name for the template.")
  });
  if (name === null) return;

  const list = listTemplates();
  const existing = findTemplateIndexByName(list, name);
  const record = { name, data: serialize() };

  if (existing !== -1) {
    promptTemplateOverwrite(list[existing].name, () => {
      list[existing] = record;
      if (!writeTemplates(list)) return toastError("Could not save the template.");
      refreshLibraries();
      toast("Template overwritten: " + name);
    });
    return;
  }
  list.push(record);
  if (!writeTemplates(list)) return toastError("Could not save the template.");
  refreshLibraries();
  toast("Template saved: " + name);
}

/* --------------------------------------------------------------- brands */

export function loadBrand(index) {
  const entry = getBrand(index);
  if (!entry) return;
  applyBrand(() => applyBrandRecord(entry.data));
  toast("Brand loaded: " + entry.name);
}

export async function deleteBrand(index) {
  const entry = listBrands()[index];
  if (!entry) return;
  const ok = await confirmAction({
    title: "Remove brand?",
    message: `The brand "${entry.name}" will be removed from your saved brands. The current invoice is not changed.`,
    confirmLabel: "Remove brand",
    danger: true
  });
  if (!ok) return;
  const list = listBrands();
  const at = list.findIndex(b => b.name === entry.name && JSON.stringify(b.data) === JSON.stringify(entry.data));
  if (at === -1) return refreshLibraries();
  list.splice(at, 1);
  if (!writeBrands(list)) return toastError("Could not update the brand library.");
  refreshLibraries();
  toast("Brand removed: " + entry.name);
}

async function saveBrand() {
  const name = await promptText({
    title: "Save brand",
    message: "A brand keeps your company details, logo, design, payment details and terms, without any client or invoice details.",
    label: "Brand name",
    placeholder: "For example: SA Learning",
    confirmLabel: "Save brand",
    validate: text => (text ? "" : "Enter a name for the brand.")
  });
  if (name === null) return;
  const list = listBrands();
  list.push({ name, data: serializeBrand() });
  if (!writeBrands(list)) return toastError("Could not save the brand.");
  refreshLibraries();
  toast("Brand saved: " + name);
}

export function initLibraryControls() {
  $("saveTemplateBtn").onclick = saveTemplate;
  $("saveBrandBtn").onclick = saveBrand;
}
