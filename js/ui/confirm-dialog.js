/**
 * Shared confirmation dialog.
 *
 * Reuses the existing .confirm-dialog component (the same markup and styling as
 * the template-overwrite prompt) so destructive actions look and behave the
 * same everywhere. Falls back to window.confirm() where <dialog> is not
 * supported, which is the pattern the template-overwrite prompt already uses.
 *
 * @param {Object} options
 * @param {string} options.title
 * @param {string} options.message
 * @param {string} [options.confirmLabel]
 * @param {string} [options.cancelLabel]
 * @param {boolean} [options.danger] style the confirm button as destructive
 * @returns {Promise<boolean>} true when the user confirmed
 */

import { $ } from "../utils.js";

export function confirmAction({ title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", danger = false }) {
  const dialog = $("appConfirmDialog");

  if (!dialog || typeof dialog.showModal !== "function") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  }

  $("appConfirmTitle").textContent = title;
  $("appConfirmMessage").textContent = message;

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
  });
}
