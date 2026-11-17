/**
 * The app's folder in Google Drive and the dated backups in it.
 *
 *   SA Invoice Generator/              (app property saInvoiceGeneratorFolder)
 *     SA Invoice Generator - sync.json
 *     Backups/                         (app property saInvoiceGeneratorBackups)
 *       2026-11-17 Backup.json         (app property saInvoiceGeneratorBackup)
 *
 * A backup is the same file as "Back up everything" saves on a computer, so
 * either can be restored the same way. Backups are made automatically on the
 * first sync of the day (or week), or with Back up now, and old ones are
 * tidied away (js/cloud/backup-retention.js).
 */

import { findByProperty, stillThere, createFolder, createJsonFile, deleteFile, readSyncFile, DriveError } from "./drive-api.js";
import { backupsToDelete } from "./backup-retention.js";

export const FOLDER_NAME = "SA Invoice Generator";
export const BACKUPS_FOLDER_NAME = "Backups";
const FOLDER_KEY = "saInvoiceGeneratorFolder";
const BACKUPS_KEY = "saInvoiceGeneratorBackups";
const BACKUP_KEY = "saInvoiceGeneratorBackup";

/**
 * The app's folder and its Backups folder, made if missing.
 * @param {{folderId?: string, backupsId?: string}} known ids remembered from before
 * @returns {Promise<{folderId: string, backupsId: string}>}
 */
export async function ensureFolders(token, known = {}) {
  let folderId = known.folderId && (await stillThere(token, known.folderId)) ? known.folderId : "";
  if (!folderId) folderId = (await findByProperty(token, FOLDER_KEY, "1", { folder: true, orderBy: "createdTime" }))[0]?.id || "";
  if (!folderId) folderId = await createFolder(token, FOLDER_NAME, { [FOLDER_KEY]: "1" });
  let backupsId = known.backupsId && known.folderId === folderId && (await stillThere(token, known.backupsId)) ? known.backupsId : "";
  if (!backupsId) backupsId = (await findByProperty(token, BACKUPS_KEY, "1", { folder: true, orderBy: "createdTime" }))[0]?.id || "";
  if (!backupsId) backupsId = await createFolder(token, BACKUPS_FOLDER_NAME, { [BACKUPS_KEY]: "1" }, folderId);
  return { folderId, backupsId };
}

/** Backups in Drive, newest first: {id, name, createdTime, size, appProperties}. */
export function listBackups(token) {
  return findByProperty(token, BACKUP_KEY, "1", {
    fields: "id,name,createdTime,size,appProperties", orderBy: "createdTime desc", pageSize: 200
  });
}

/**
 * Saves a backup in the Backups folder.
 * @param {object} backup a buildBackup() object
 * @param {{name: string, device: string, kind: "auto"|"manual"}} info
 */
export function createBackup(token, backupsId, backup, { name, device, kind }) {
  return createJsonFile(token, {
    name,
    text: JSON.stringify(backup),
    parents: [backupsId],
    description: `SA Invoice Generator backup: ${backup.invoices?.length || 0} invoices, made on ${device}. Restore it from the app's Settings, or with Restore from a file.`,
    appProperties: {
      [BACKUP_KEY]: "1",
      device: String(device || "").slice(0, 60),
      invoices: String(backup.invoices?.length || 0),
      kind
    }
  }, "id,name,createdTime,size,appProperties");
}

/** Removes backups the keep rule no longer keeps. @returns {Promise<number>} how many */
export async function tidyBackups(token, backups, keep) {
  const ids = backupsToDelete(backups, keep);
  for (const id of ids) await deleteFile(token, id);
  return ids.length;
}

/** Reads a backup from Drive. */
export async function readBackup(token, id) {
  try {
    return await readSyncFile(token, id);
  } catch (err) {
    if (err.status === 0 && /damaged/.test(err.message)) throw new DriveError("That backup in Google Drive is damaged and could not be read. Nothing was changed.", 0);
    throw err;
  }
}
