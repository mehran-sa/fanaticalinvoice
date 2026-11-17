/**
 * The Settings page: account and sync (js/cloud/cloud-sync.js fills those
 * in), backups, invoice defaults, this browser, and about. Settings are kept
 * per browser (js/settings-store.js).
 */

import { $, qsa, toast } from "../utils.js";
import { APP_VERSION } from "../constants.js";
import { readSettings, writeSettings, guessDeviceName } from "../settings-store.js";
import { confirmAction } from "../ui/confirm-dialog.js";
import { clearInvoice, flushInvoiceSave } from "../storage/invoice-storage.js";
import { onViewChange } from "./appbar.js";
import { lockNow, rememberedUntil, forgetRemembered } from "../secure/lock.js";
import { dateFmt } from "../invoice/formatters.js";

function fill() {
  const s = readSettings();
  $("autoSyncToggle").checked = s.autoSync !== false;
  $("staySignedInToggle").checked = s.staySignedIn !== false;
  $("deviceName").value = s.deviceName;
  $("deviceName").placeholder = guessDeviceName();
  $("backupFrequency").value = s.backupFrequency;
  $("backupKeep").value = s.backupKeep;
  $("defaultDueDays").value = String(s.defaultDueDays);
  if ($("defaultDueDays").value !== String(s.defaultDueDays)) $("defaultDueDays").value = "14";
  $("pdfNameStyle").value = s.pdfName;
  $("markIssuedDefault").checked = s.markIssued !== false;
}

/** Removes every invoice and setting from this browser, then reloads. */
async function forgetThisBrowser() {
  const ok = await confirmAction({
    title: "Remove everything from this browser?",
    message: "Every invoice, client, template and brand is removed from this browser, Google Drive sync signs out, and the master password is forgotten here. " +
      "Your copy in Google Drive, and any backup files, stay as they are. Signing in again here brings it all back.",
    confirmLabel: "Remove from this browser",
    danger: true
  });
  if (!ok) return;
  flushInvoiceSave();
  clearInvoice();
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("invoiceStudio")) keys.push(key);
  }
  for (const key of keys) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
  await forgetRemembered();
  location.hash = "";
  location.reload();
}

async function showLockStatus() {
  const until = await rememberedUntil().catch(() => null);
  const day = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  $("lockStatus").textContent = until
    ? `This device remembers the master password until ${dateFmt(day(until))}. Lock now to ask for it again here.`
    : "This device does not remember the master password: it is asked for each time the app opens.";
}

/** Highlights the section in view in the settings menu. */
function trackSections() {
  const links = qsa(".settings-nav a");
  const mark = id => links.forEach(a => {
    if (a.dataset.section === id) a.setAttribute("aria-current", "true");
    else a.removeAttribute("aria-current");
  });
  links.forEach(a => {
    a.addEventListener("click", e => {
      e.preventDefault();
      const target = $(a.dataset.section);
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      mark(a.dataset.section);
      try { history.replaceState({ view: "settings" }, "", "#" + a.dataset.section); } catch { /* ignore */ }
    });
  });
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visible) mark(visible.target.id === "set-sync" ? "set-account" : visible.target.id);
    }, { rootMargin: "-80px 0px -60% 0px" });
    qsa(".settings-main > .card").forEach(card => observer.observe(card));
  }
}

export function initSettings() {
  if (!$("view-settings")) return;
  fill();
  $("appVersionText").textContent = "version " + APP_VERSION;

  $("autoSyncToggle").addEventListener("change", e => {
    writeSettings({ autoSync: e.target.checked });
    toast(e.target.checked ? "Sync is automatic again." : "Sync is off. Changes stay on this device until you press Sync now.");
  });
  $("staySignedInToggle").addEventListener("change", e => writeSettings({ staySignedIn: e.target.checked }));
  $("deviceName").addEventListener("change", e => {
    const name = e.target.value.trim().slice(0, 40);
    writeSettings({ deviceName: name });
    e.target.value = readSettings().deviceName;
    toast(`This device is called "${readSettings().deviceName}".`);
  });
  $("backupFrequency").addEventListener("change", e => writeSettings({ backupFrequency: e.target.value }));
  $("backupKeep").addEventListener("change", e => writeSettings({ backupKeep: e.target.value }));
  $("defaultDueDays").addEventListener("change", e => writeSettings({ defaultDueDays: Number(e.target.value) }));
  $("pdfNameStyle").addEventListener("change", e => writeSettings({ pdfName: e.target.value }));
  $("markIssuedDefault").addEventListener("change", e => writeSettings({ markIssued: e.target.checked }));
  $("forgetDeviceBtn").onclick = forgetThisBrowser;
  $("lockNowBtn").onclick = () => lockNow();
  showLockStatus();

  trackSections();
  onViewChange((view, before, { section }) => {
    if (view !== "settings") return;
    fill();
    showLockStatus();
    if (section && $(section)) requestAnimationFrame(() => $(section).scrollIntoView({ block: "start" }));
  });
}
