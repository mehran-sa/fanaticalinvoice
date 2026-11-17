/**
 * A plain undo/redo stack. No DOM, no application state, no imports - so it can
 * be reasoned about and tested on its own.
 *
 * The stack always holds at least the baseline entry, so `canUndo()` is false
 * until something has actually changed.
 */

/**
 * @param {{limit?: number}} [options]
 */
export function createHistoryStack({ limit = 60 } = {}) {
  /** @type {unknown[]} */
  let entries = [];
  let index = -1;

  return {
    /** Seeds the stack with the starting state and clears any history. */
    init(snapshot) {
      entries = [snapshot];
      index = 0;
    },

    /** Adds a new state, discarding anything that was available to redo. */
    push(snapshot) {
      entries = entries.slice(0, index + 1);
      entries.push(snapshot);
      if (entries.length > limit) entries.shift();
      index = entries.length - 1;
    },

    /** @returns the previous state, or null when there is nothing to undo */
    undo() {
      if (index <= 0) return null;
      index -= 1;
      return entries[index];
    },

    /** @returns the next state, or null when there is nothing to redo */
    redo() {
      if (index >= entries.length - 1) return null;
      index += 1;
      return entries[index];
    },

    current: () => (index >= 0 ? entries[index] : null),
    canUndo: () => index > 0,
    canRedo: () => index >= 0 && index < entries.length - 1,
    size: () => entries.length,
    position: () => index
  };
}
