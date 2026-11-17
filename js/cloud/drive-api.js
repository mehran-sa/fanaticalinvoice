/**
 * The few Google Drive API calls sync and backups need: find the app's files
 * and folders, read them, create, replace, move and delete them. Every call
 * takes the access token from js/cloud/google-auth.js.
 *
 * Since 2.14.0 everything lives in one folder in My Drive:
 *   SA Invoice Generator/
 *     SA Invoice Generator - sync.json   kept up to date by sync
 *     Backups/
 *       2026-11-17 Backup.json           dated backups (js/cloud/drive-backups.js)
 * Each is marked with an app property so it can be found again from any
 * device. With the drive.file permission the app can see only files and
 * folders it created, so these searches never see anything else.
 */

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const SYNC_FILE_NAME = "SA Invoice Generator - sync.json";
const APP_PROPERTY = { key: "saInvoiceGeneratorSync", value: "1" };
const FOLDER_MIME = "application/vnd.google-apps.folder";
const FILE_FIELDS = "id,name,version,modifiedTime";
/** Drive's limit for a simple upload. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** An error from Google, with the HTTP status (401 = sign in again). */
export class DriveError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function call(token, url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: { Authorization: "Bearer " + token, ...(options.headers || {}) }
    });
  } catch {
    throw new DriveError("Google Drive could not be reached. Check your internet connection.", 0);
  }
  if (response.ok) return response;
  let detail = "";
  try { detail = (await response.json())?.error?.message || ""; } catch { /* not JSON */ }
  if (response.status === 401) throw new DriveError("Your Google sign-in has expired.", 401);
  if (response.status === 403 && /api has not been used|is disabled/i.test(detail)) {
    throw new DriveError("The Google Drive API is not turned on for this app's Google Cloud project. See GOOGLE-DRIVE-SYNC.md.", 403);
  }
  if (response.status === 403 || response.status === 429) {
    throw new DriveError("Google Drive is busy or refused the request. Sync will try again shortly." + (detail ? " (" + detail + ")" : ""), response.status);
  }
  throw new DriveError(`Google Drive returned an error (${response.status})${detail ? ": " + detail : ""}.`, response.status);
}

/** Name and email of the signed-in Google account. */
export async function getAccount(token) {
  const response = await call(token, `${API}/about?fields=user(displayName,emailAddress)`);
  const { user } = await response.json();
  return { name: user?.displayName || "", email: user?.emailAddress || "" };
}

/** The sync file's id, version and modified time, or null if there is none. */
export async function findSyncFile(token, knownId = "") {
  if (knownId) {
    try {
      const response = await call(token, `${API}/files/${encodeURIComponent(knownId)}?fields=${FILE_FIELDS},trashed`);
      const file = await response.json();
      if (!file.trashed) return file;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
  }
  const q = `appProperties has { key='${APP_PROPERTY.key}' and value='${APP_PROPERTY.value}' } and trashed = false`;
  const url = `${API}/files?spaces=drive&orderBy=modifiedTime desc&pageSize=10` +
    `&fields=files(${FILE_FIELDS})&q=${encodeURIComponent(q)}`;
  const response = await call(token, url);
  const { files } = await response.json();
  return Array.isArray(files) && files.length ? files[0] : null;
}

/** Reads and parses the sync file. */
export async function readSyncFile(token, id) {
  const response = await call(token, `${API}/files/${encodeURIComponent(id)}?alt=media`);
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new DriveError("The sync file in Google Drive is damaged and could not be read. Nothing was changed.", 0);
  }
}

function checkSize(text) {
  if (new Blob([text]).size > MAX_UPLOAD_BYTES) {
    throw new DriveError("Your data is larger than 5 MB, too large to sync. Use smaller logos, or Back up everything to a file.", 413);
  }
}

/** Creates a JSON file and returns the requested fields. */
export async function createJsonFile(token, { name, text, appProperties, parents, description = "" }, fields = FILE_FIELDS) {
  checkSize(text);
  const boundary = "sa-invoice-" + crypto.randomUUID();
  const metadata = {
    name,
    mimeType: "application/json",
    ...(description ? { description } : {}),
    ...(parents && parents.length ? { parents } : {}),
    appProperties
  };
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${text}\r\n--${boundary}--`;
  const response = await call(token, `${UPLOAD}/files?uploadType=multipart&fields=${fields}`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  return response.json();
}

/** Creates the sync file (in the app's folder) and returns its {id, version, modifiedTime}. */
export function createSyncFile(token, text, folderId = "") {
  return createJsonFile(token, {
    name: SYNC_FILE_NAME,
    text,
    parents: folderId ? [folderId] : [],
    description: "SA Invoice Generator keeps your saved invoices, clients, templates and brands here so you can open them on any device. Do not edit this file.",
    appProperties: { [APP_PROPERTY.key]: APP_PROPERTY.value }
  });
}

/* ------------------------------------------------------------ folders */

/**
 * Files or folders the app made that carry an app property.
 * @returns {Promise<object[]>}
 */
export async function findByProperty(token, key, value = "1", { folder = false, fields = "id,name", orderBy = "createdTime desc", pageSize = 20 } = {}) {
  const q = `appProperties has { key='${key}' and value='${value}' } and trashed = false` +
    (folder ? ` and mimeType = '${FOLDER_MIME}'` : "");
  const url = `${API}/files?spaces=drive&orderBy=${encodeURIComponent(orderBy)}&pageSize=${pageSize}` +
    `&fields=${encodeURIComponent(`files(${fields})`)}&q=${encodeURIComponent(q)}`;
  const response = await call(token, url);
  const { files } = await response.json();
  return Array.isArray(files) ? files : [];
}

/** Whether a file or folder still exists (and is not in the bin). */
export async function stillThere(token, id) {
  if (!id) return false;
  try {
    const response = await call(token, `${API}/files/${encodeURIComponent(id)}?fields=id,trashed`);
    return !(await response.json()).trashed;
  } catch (err) {
    if (err.status === 404) return false;
    throw err;
  }
}

/** Creates a folder and returns its id. */
export async function createFolder(token, name, appProperties, parentId = "") {
  const response = await call(token, `${API}/files?fields=id,name`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, appProperties, ...(parentId ? { parents: [parentId] } : {}) })
  });
  return (await response.json()).id;
}

/** Moves a file into a folder (out of wherever it was). */
export async function moveToFolder(token, id, folderId) {
  const current = await call(token, `${API}/files/${encodeURIComponent(id)}?fields=parents`);
  const parents = (await current.json()).parents || [];
  if (parents.length === 1 && parents[0] === folderId) return;
  const remove = parents.filter(p => p !== folderId).join(",");
  await call(token, `${API}/files/${encodeURIComponent(id)}?addParents=${encodeURIComponent(folderId)}` +
    (remove ? `&removeParents=${encodeURIComponent(remove)}` : "") + "&fields=id", {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: "{}"
  });
}

/** Deletes a file the app made (for tidying old backups). */
export async function deleteFile(token, id) {
  try {
    await call(token, `${API}/files/${encodeURIComponent(id)}`, { method: "DELETE" });
  } catch (err) {
    if (err.status !== 404) throw err;
  }
}

/** Replaces the sync file's content and returns its new {id, version, modifiedTime}. */
export async function updateSyncFile(token, id, text) {
  checkSize(text);
  const response = await call(token, `${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=${FILE_FIELDS}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: text
  });
  return response.json();
}
