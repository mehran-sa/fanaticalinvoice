/**
 * Which Google Drive backups to keep. With "tidy" (the default): every
 * backup from the most recent day (so Back up now never removes the
 * morning's), one backup for each of the 30 most recent days that have one,
 * and the newest backup of each of the 12 most recent months. Everything else
 * is removed. With "all", nothing is removed. Pure, so it is unit
 * tested (tests/unit.test.mjs).
 */

/** The day a backup is for: from its name ("2026-11-17 Backup.json") or when it was made. */
export const backupDay = backup =>
  (/^(\d{4}-\d{2}-\d{2})\b/.exec(backup?.name || "") || [])[1] || String(backup?.createdTime || "").slice(0, 10);

/**
 * @param {Array<{id: string, name: string, createdTime: string}>} backups
 * @param {"tidy"|"all"} keep
 * @returns {string[]} ids of backups to delete
 */
export function backupsToDelete(backups, keep = "tidy", { days = 30, months = 12 } = {}) {
  if (keep === "all" || !Array.isArray(backups) || backups.length < 2) return [];
  const sorted = [...backups].sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)));
  const newestDay = backupDay(sorted[0]);
  const kept = new Set(sorted.filter(b => backupDay(b) === newestDay).map(b => b.id));
  const daysSeen = new Set();
  const monthsSeen = new Set();
  for (const backup of sorted) {
    const day = backupDay(backup);
    if (!daysSeen.has(day) && daysSeen.size < days) {
      daysSeen.add(day);
      kept.add(backup.id);
    }
    const month = day.slice(0, 7);
    if (!monthsSeen.has(month) && monthsSeen.size < months) {
      monthsSeen.add(month);
      kept.add(backup.id);
    }
  }
  return sorted.filter(b => !kept.has(b.id)).map(b => b.id);
}

/**
 * Whether an automatic backup is due.
 * @param {string} lastIso when the last backup was made ("" for never)
 * @param {"daily"|"weekly"|"off"} frequency
 * @param {string} todayIso this device's date (YYYY-MM-DD)
 */
export function backupDue(lastIso, frequency, todayIso, now = Date.now()) {
  if (frequency === "off") return false;
  if (!lastIso) return true;
  const last = new Date(lastIso);
  if (Number.isNaN(last.getTime())) return true;
  if (frequency === "weekly") return now - last.getTime() >= 7 * 864e5 - 60 * 60 * 1000;
  const y = last.getFullYear();
  const m = String(last.getMonth() + 1).padStart(2, "0");
  const d = String(last.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}` !== todayIso;
}
