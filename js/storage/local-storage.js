/**
 * Thin, guarded wrapper around localStorage.
 *
 * Every access is wrapped: a disabled, full or blocked store must never stop
 * the application loading or interrupt editing.
 */

export function readRaw(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeRaw(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

export function remove(key) {
  try { localStorage.removeItem(key); return true; } catch { return false; }
}

/** Reads and parses JSON, returning the fallback on any failure. */
export function readJSON(key, fallback = null) {
  const raw = readRaw(key);
  if (raw === null) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

/** Serializes and writes JSON. Returns false when the write failed. */
export function writeJSON(key, value) {
  try { return writeRaw(key, JSON.stringify(value)); } catch { return false; }
}
