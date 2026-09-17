/**
 * Splits a royalty sheet "Name" cell into a course name and a bundle name.
 *
 * Fanatical royalty sheets write the cell as:
 *
 *     Course Name
 *      in Bundle Name
 *
 * Logic is carried over unchanged from the standalone Bundle Name Splitter
 * tool, including the fallback for sheets exported without the line break and
 * the two sentinel bundle names.
 */

/** Used when the Name cell is empty (rows like this are skipped upstream). */
export const UNASSIGNED_BUNDLE = "Unassigned";
/** Used when no "in <bundle>" part can be found. */
export const STANDALONE_BUNDLE = "Standalone / No bundle found";

/**
 * @param {unknown} raw
 * @returns {{course: string, bundle: string}}
 */
export function splitName(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { course: "", bundle: UNASSIGNED_BUNDLE };

  const normalized = text.replace(/\r/g, "");

  // Preferred pattern: course, line break, " in <bundle>".
  const match = normalized.match(/^([\s\S]*?)\s*\n\s*in\s+([\s\S]+)$/i);
  if (match) return { course: match[1].trim(), bundle: match[2].trim() };

  // Fallback when line breaks are missing.
  const fallback = normalized.match(/^([\s\S]*?)\s+in\s+(.+)$/i);
  if (fallback) return { course: fallback[1].trim(), bundle: fallback[2].trim() };

  return { course: text, bundle: STANDALONE_BUNDLE };
}
