/**
 * Google sign-in for Drive sync, using Google Identity Services (the "token
 * model"): the browser gets a short-lived access token (about an hour) for
 * one permission only, drive.file, which lets the app see and change only the
 * files it created itself in the user's Drive. Nothing else in Drive is
 * visible to it, and there is no server: the token stays in this browser.
 *
 * Google's script is loaded only when sync is set up (js/config.js) and the
 * page is served over http(s); a page opened from disk cannot use Google
 * sign-in.
 */

import { GOOGLE_CLIENT_ID, GOOGLE_HOSTED_DOMAIN } from "../config.js";
import { STORAGE_KEYS } from "../constants.js";
import { readJSON, writeJSON, remove } from "../storage/local-storage.js";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GIS_SRC = "https://accounts.google.com/gsi/client";
/** A token this close to expiry is treated as expired. */
const EXPIRY_MARGIN_MS = 2 * 60 * 1000;

export const syncConfigured = () => Boolean(GOOGLE_CLIENT_ID);
export const syncAvailableHere = () =>
  typeof location !== "undefined" && (location.protocol === "https:" || location.protocol === "http:");

let gisPromise = null;

/** Loads Google's sign-in script once. */
export function loadGoogleScript() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => (window.google?.accounts?.oauth2 ? resolve() : reject(Error("Google sign-in did not start.")));
    script.onerror = () => {
      gisPromise = null;
      reject(Error("Google sign-in could not be loaded. Check your internet connection."));
    };
    document.head.appendChild(script);
  });
  return gisPromise;
}

/* -------------------------------------------------------------- token */

/** The stored token, if it has not expired. */
export function currentToken() {
  const saved = readJSON(STORAGE_KEYS.cloudToken, null);
  if (!saved || typeof saved.token !== "string" || !saved.token) return null;
  if (!(Number(saved.expiresAt) - EXPIRY_MARGIN_MS > Date.now())) return null;
  return saved.token;
}

export function forgetToken() {
  remove(STORAGE_KEYS.cloudToken);
}

/**
 * Asks Google for an access token. Opens Google's sign-in window, so it must
 * be called from a click (browsers block windows opened otherwise). After the
 * first time, Google usually closes the window by itself.
 *
 * @param {{email?: string, chooseAccount?: boolean}} [options]
 * @returns {Promise<string>} the access token
 */
export async function requestToken({ email = "", chooseAccount = false } = {}) {
  await loadGoogleScript();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      include_granted_scopes: false,
      ...(GOOGLE_HOSTED_DOMAIN ? { hd: GOOGLE_HOSTED_DOMAIN } : {}),
      callback: response => {
        if (response.error) {
          reject(Error(response.error === "access_denied"
            ? "Google sign-in was cancelled."
            : "Google sign-in failed: " + (response.error_description || response.error)));
          return;
        }
        if (!window.google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
          reject(Error("Google Drive access was not allowed. Sign in again and tick the box that lets SA Invoice Generator use its own files in your Google Drive."));
          return;
        }
        const seconds = Number(response.expires_in) || 3599;
        writeJSON(STORAGE_KEYS.cloudToken, { token: response.access_token, expiresAt: Date.now() + seconds * 1000 });
        resolve(response.access_token);
      },
      error_callback: err => {
        reject(Error(err?.type === "popup_failed_to_open"
          ? "The Google sign-in window was blocked. Allow pop-ups for this site and try again."
          : err?.type === "popup_closed"
            ? "The Google sign-in window was closed before sign-in finished."
            : "Google sign-in failed. Please try again."));
      }
    });
    client.requestAccessToken({
      prompt: chooseAccount || !email ? "select_account" : "",
      ...(email && !chooseAccount ? { login_hint: email } : {})
    });
  });
}
