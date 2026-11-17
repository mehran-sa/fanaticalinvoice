/**
 * Shared dialogs: confirmation (optionally with a list of points) and text
 * entry. They replace the browser's own confirm() and prompt() popups so every
 * question in the app looks and behaves the same, can be styled and read by
 * screen readers, and does not block the page.
 *
 * Both fall back to the browser popups where <dialog> is not supported.
 */

import { $ } from "../utils.js";

/**
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string[]} [options.list]  points shown as a bulleted list
 * @param {string} [options.confirmLabel]
 * @param {string} [options.cancelLabel]
 * @param {boolean} [options.danger] style the confirm button as destructive
 * @returns {Promise<boolean>} true when the user confirmed
 */
export function confirmAction({ title, message, list = [], confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false }) {
  const dialog = $("appConfirmDialog");

  if (!dialog || typeof dialog.showModal !== "function") {
    const points = list.length ? "\n\n- " + list.join("\n- ") : "";
    return Promise.resolve(window.confirm(`${title}\n\n${message}${points}`));
  }

  $("appConfirmTitle").textContent = title;
  $("appConfirmMessage").textContent = message;
  const listEl = $("appConfirmList");
  if (listEl) {
    listEl.textContent = "";
    for (const point of list) {
      const li = document.createElement("li");
      li.textContent = point;
      listEl.appendChild(li);
    }
    listEl.hidden = !list.length;
  }

  const cancel = $("appConfirmCancel");
  const accept = $("appConfirmAccept");
  cancel.textContent = cancelLabel;
  accept.textContent = confirmLabel;
  accept.classList.toggle("danger", danger);
  accept.classList.toggle("primary", !danger);

  dialog.returnValue = "";

  return new Promise(resolve => {
    cancel.onclick = () => dialog.close("cancel");
    accept.onclick = () => dialog.close("confirm");
    dialog.onclose = () => {
      dialog.onclose = null;
      cancel.onclick = null;
      accept.onclick = null;
      // Escape and the backdrop both close with an empty returnValue, which is
      // treated as a cancel.
      resolve(dialog.returnValue === "confirm");
    };
    dialog.showModal();
    // Safe default: focus the button that does not change anything.
    cancel.focus();
  });
}

/**
 * Asks for a short piece of text, such as a template name.
 * @param {Object} options
 * @param {string} options.title
 * @param {string} [options.message]
 * @param {string} options.label     field label
 * @param {string} [options.value]   starting text
 * @param {string} [options.placeholder]
 * @param {string} [options.confirmLabel]
 * @param {(text: string) => string} [options.validate] returns an error
 *        message to show, or "" when the text is acceptable
 * @returns {Promise<string|null>} the trimmed text, or null when cancelled
 */
export function promptText({ title, message = "", label, value = "", placeholder = "", confirmLabel = "Save", validate }) {
  const dialog = $("appPromptDialog");
  const check = text => (validate ? validate(text) : text ? "" : "Enter a name.");

  if (!dialog || typeof dialog.showModal !== "function") {
    const entered = window.prompt(`${title}${message ? "\n\n" + message : ""}`, value);
    if (entered === null) return Promise.resolve(null);
    return Promise.resolve(check(entered.trim()) ? null : entered.trim());
  }

  const input = $("appPromptInput");
  const error = $("appPromptError");
  const accept = $("appPromptAccept");
  const cancel = $("appPromptCancel");
  $("appPromptTitle").textContent = title;
  $("appPromptMessage").textContent = message;
  $("appPromptMessage").hidden = !message;
  $("appPromptLabel").textContent = label;
  input.value = value;
  input.placeholder = placeholder;
  error.hidden = true;
  accept.textContent = confirmLabel;
  dialog.returnValue = "";

  return new Promise(resolve => {
    const submit = () => {
      const problem = check(input.value.trim());
      if (problem) {
        error.textContent = problem;
        error.hidden = false;
        input.focus();
        return;
      }
      dialog.close("confirm");
    };
    accept.onclick = submit;
    cancel.onclick = () => dialog.close("cancel");
    input.onkeydown = e => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      }
    };
    input.oninput = () => { error.hidden = true; };
    dialog.onclose = () => {
      dialog.onclose = null;
      accept.onclick = cancel.onclick = input.onkeydown = input.oninput = null;
      resolve(dialog.returnValue === "confirm" ? input.value.trim() : null);
    };
    dialog.showModal();
    input.focus();
    input.select();
  });
}
