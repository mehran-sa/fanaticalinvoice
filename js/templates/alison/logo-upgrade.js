/**
 * Replaces academy logos that an earlier version saved into invoices and that
 * have since been corrected. A saved invoice keeps its own copy of its logo,
 * so without this, invoices made before the fix (and next-quarter invoices
 * copied from them) would keep showing the old image.
 *
 * Each retired logo is recognised by its length and its start and end, so the
 * old images themselves are not shipped again. A logo the user uploaded is
 * never touched.
 */

/** [template id, logos.js key, length, start, end] of each retired image. */
const RETIRED = [
  // 2.15.2: the Training Express logo was cut off ("TRAININ", icon clipped).
  ["alison-trainingexpress", "trainingexpress", 20483, "data:image/webp;base64,UklGRug7AABXRUJQVlA4INw7AABQCAGdASpOA", "5k94zmkqi3ReuG0elAAACgJaW0OGIzMeSCIAAAA="]
];

/** The logos.js key to use instead, when this is a retired logo; otherwise "". */
export function retiredLogoKey(template, logo) {
  if (typeof logo !== "string" || !logo) return "";
  const hit = RETIRED.find(([id, , length, start, end]) =>
    id === template && logo.length === length && logo.startsWith(start) && logo.endsWith(end));
  return hit ? hit[1] : "";
}

/**
 * The corrected logo for a retired one, loaded on demand; "" when the logo is
 * current or the user's own.
 * @returns {Promise<string>}
 */
export async function upgradedLogo(template, logo) {
  const key = retiredLogoKey(template, logo);
  if (!key) return "";
  const logos = (await import("./logos.js")).default;
  return logos[key] || "";
}
