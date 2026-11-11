/**
 * Undo/redo for the invoice.
 *
 * How changes are detected
 * -----------------------
 * Every mutation in the application ends with saveInvoice(), so that is the
 * single funnel this service listens on - no editor module can accidentally
 * make a change that history misses. saveInvoice() passes `typing: true` for
 * the three keystroke paths (invoice fields, line item cells, column headings);
 * those are coalesced on a debounce so a typed word is one entry rather than
 * one per character. Everything else - adding items, columns, toggles, imports,
 * applying the bundle tool, loading a brand or template, resetting - commits
 * immediately.
 *
 * What is ignored
 * ---------------
 * A commit is skipped when the new snapshot is identical to the current one, so
 * saves that change nothing never appear. Preview zoom is excluded from both
 * the comparison and the restore, because it is a view setting rather than
 * invoice content.
 *
 * Wiring
 * ------
 * This module deliberately does not import the session or the serializer.
 * app.js configures it with capture/restore functions, which keeps history at
 * the bottom of the dependency graph and avoids a cycle
 * (editor -> history -> session -> editor).
 */

import { HISTORY_LIMIT, HISTORY_DEBOUNCE_MS } from "../constants.js";
import { createHistoryStack } from "./history-stack.js";

const stack = createHistoryStack({ limit: HISTORY_LIMIT });

/** @type {null | (() => object)} */
let capture = null;
/** @type {null | ((snapshot: object) => void)} */
let restore = null;
/** @type {null | ((state: {canUndo: boolean, canRedo: boolean}) => void)} */
let listener = null;

let suspended = false;
let timer = null;

/**
 * Snapshots share arrays with live state, so every entry is deep-copied.
 *
 * The logo is the exception. It is an immutable string (a data URL of up to
 * about 4 MB), so entries can safely share it. A JSON round trip made a fresh
 * copy for every entry, which with a large logo and the 60-entry limit could
 * hold a few hundred megabytes of duplicate image data.
 */
const clone = value => {
  if (!value || typeof value !== "object") return value;
  const { logo, watermark, ...rest } = value;
  const copy = JSON.parse(JSON.stringify(rest));
  if (logo !== undefined) copy.logo = logo;
  if (watermark !== undefined) copy.watermark = watermark;
  return copy;
};

/**
 * Comparison key: everything except the preview-only zoom level. The logo is
 * compared separately (by value, which is fast for identical strings) so the
 * image is not re-serialised on every commit.
 */
const signature = snapshot => {
  if (!snapshot) return null;
  const rest = { ...snapshot };
  delete rest.zoom;
  delete rest.logo;
  delete rest.watermark;
  return JSON.stringify(rest);
};

const sameEntry = (a, b) =>
  Boolean(a) && Boolean(b) && a.logo === b.logo && a.watermark === b.watermark && signature(a) === signature(b);

const notify = () => {
  listener?.({ canUndo: stack.canUndo(), canRedo: stack.canRedo() });
};

const cancelPending = () => {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
};

/** Commits the current state if it differs from the last entry. */
function commit() {
  cancelPending();
  if (!capture) return false;

  const snapshot = clone(capture());
  if (sameEntry(stack.current(), snapshot)) return false;

  stack.push(snapshot);
  notify();
  return true;
}

function applyEntry(snapshot) {
  if (!restore) return;
  suspended = true;
  try {
    restore(clone(snapshot));
  } finally {
    suspended = false;
  }
}

/**
 * Connects history to the application.
 * @param {{capture: () => object, restore: (s: object) => void, onChange?: Function}} options
 */
export function configureHistory({ capture: captureFn, restore: restoreFn, onChange }) {
  capture = captureFn;
  restore = restoreFn;
  if (onChange) listener = onChange;
  cancelPending();
  stack.init(clone(capture()));
  notify();
}

/**
 * Starts a fresh history from the current state. Used when a different saved
 * invoice is opened, so Undo never steps back into another invoice.
 */
export function resetHistory() {
  if (!capture) return;
  cancelPending();
  stack.init(clone(capture()));
  notify();
}

/** Lets the UI subscribe to button-enabled state. */
export function onHistoryChange(fn) {
  listener = fn;
  notify();
}

/**
 * Called by saveInvoice() after every mutation.
 * @param {{typing?: boolean}} [options] typing edits are coalesced
 */
export function recordChange({ typing = false } = {}) {
  if (suspended || !capture) return;
  if (!typing) {
    commit();
    return;
  }
  cancelPending();
  timer = setTimeout(() => {
    timer = null;
    commit();
  }, HISTORY_DEBOUNCE_MS);
}

/** Commits any pending typing immediately. */
export function flushHistory() {
  if (timer === null) return false;
  return commit();
}

export function undoInvoice() {
  // A half-typed word must become its own entry before stepping back over it.
  flushHistory();
  const snapshot = stack.undo();
  if (!snapshot) return false;
  applyEntry(snapshot);
  notify();
  return true;
}

export function redoInvoice() {
  cancelPending();
  const snapshot = stack.redo();
  if (!snapshot) return false;
  applyEntry(snapshot);
  notify();
  return true;
}

export const canUndo = () => stack.canUndo();
export const canRedo = () => stack.canRedo();

/** Test seam. */
export const historyState = () => ({
  size: stack.size(),
  position: stack.position(),
  canUndo: stack.canUndo(),
  canRedo: stack.canRedo(),
  pending: timer !== null
});
