/**
 * Settings for this browser (the Settings page). They stay on this device and
 * are not synced: each computer has its own name, and can sync or back up
 * differently.
 */

import { STORAGE_KEYS } from "./constants.js";
import { readJSON, writeJSON } from "./storage/local-storage.js";

/** A short name for this device, guessed from the browser until it is changed. */
export function guessDeviceName() {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent || "";
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  if (/Mac OS X|Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/CrOS/.test(ua)) return "Chromebook";
  if (/Linux/.test(ua)) return "Linux computer";
  return "This device";
}

export const SETTINGS_DEFAULTS = Object.freeze({
  /** "academy": Janets-Alison_2026-11005_Q3-2026.pdf; "number": 2026-11005.pdf */
  pdfName: "academy",
  /** Tick "Mark as issued after exporting" by default. */
  markIssued: true,
  /** Sync with Google Drive by itself; off means only when Sync now is pressed. */
  autoSync: true,
  /** Renew Google's hourly sign-in on the next click, so sync carries on. */
  staySignedIn: true,
  /** "daily" | "weekly" | "off": automatic backups in the Drive Backups folder. */
  backupFrequency: "daily",
  /** "tidy": 30 daily and 12 monthly backups; "all": every backup. */
  backupKeep: "tidy",
  deviceName: ""
});

export function readSettings() {
  const saved = readJSON(STORAGE_KEYS.settings, {});
  const merged = { ...SETTINGS_DEFAULTS, ...(saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {}) };
  if (!String(merged.deviceName || "").trim()) merged.deviceName = guessDeviceName();
  return merged;
}

const listeners = new Set();
export const onSettingsChange = fn => { listeners.add(fn); };

export function writeSettings(patch) {
  const saved = readJSON(STORAGE_KEYS.settings, {}) || {};
  const next = { ...saved, ...patch };
  const ok = writeJSON(STORAGE_KEYS.settings, next);
  listeners.forEach(fn => fn(readSettings()));
  return ok;
}
