/**
 * The save indicator next to the app name. Saving is automatic, so this is
 * the only sign that it happened: "Saving…", "Saved · just now", or a lasting
 * warning when saving failed or is paused for a choice between two tabs.
 */

import { $ } from "../utils.js";
import { onSaveState } from "../storage/invoice-storage.js";

const REFRESH_MS = 30000;

function ago(date) {
  if (!date) return "";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  return "at " + date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function initSaveState() {
  const box = $("saveState");
  const text = $("saveStateText");
  if (!box || !text) return;
  let last = { status: "saved", at: null };

  const render = () => {
    const { status, at } = last;
    box.className = "save-state " + status;
    if (status === "pending") {
      text.textContent = "Saving\u2026";
      box.title = "Your changes are saved a moment after you stop typing.";
    } else if (status === "failed") {
      text.textContent = "Not saved";
      box.title = "Browser storage is full or unavailable. Use Back up everything or Export JSON to keep a copy.";
    } else if (status === "held") {
      text.textContent = "Saving paused";
      box.title = "This invoice was changed in another tab. Choose which version to keep.";
    } else {
      text.textContent = at ? "Saved \u00b7 " + ago(at) : "Saved";
      box.title = "Saved in this browser on this device.";
    }
  };

  onSaveState(state => {
    last = state;
    render();
  });
  setInterval(() => { if (last.status === "saved") render(); }, REFRESH_MS);
}
