/**
 * Background watermark for templates that support it (capabilities.watermark;
 * the Modern template since 2.8.0).
 *
 * The watermark is an SVG layer behind the invoice content, not a CSS
 * background: browsers leave background images out of printouts and PDFs
 * unless "Background graphics" is switched on, but SVG content always prints.
 *
 * Kinds: text (for example "PAID", "DRAFT" or a brand name), the brand's
 * logo, or a separately uploaded image. Settings: opacity (2-100%), size (as a share of
 * the page width), angle, colour (text only) and layout:
 *   centred  one watermark in the middle of each printed page. Page 1 is the
 *            full paper height (A4 297mm, US Letter 279.4mm); later pages are
 *            12mm shorter, because the print layout (js/print/print-styles.js)
 *            gives them a 12mm top margin.
 *   tiled    repeated across the whole invoice.
 *
 * Everything is drawn in millimetres, so the preview and the printout match.
 */

import { $, fieldValue, esc, num, clamp } from "../utils.js";
import { state } from "../state.js";
import { paperFor, NEXT_PAGE_TOP_MARGIN_MM } from "../constants.js";

const PX_PER_MM = 96 / 25.4;

export const WATERMARK_DEFAULTS = { opacity: 8, size: 70, angle: -30 };

const HEX = /^#[0-9a-f]{6}$/i;
const round = v => Math.round(v * 100) / 100;

/** The watermark settings currently in the form. */
export function watermarkSettings() {
  return {
    type: fieldValue("watermarkType") || "none",
    text: (fieldValue("watermarkText") || "").trim(),
    // Up to 100%: an image that is already faded (like the UKHF one) prints at full strength.
    opacity: clamp(num(fieldValue("watermarkOpacity")) || WATERMARK_DEFAULTS.opacity, 2, 100) / 100,
    size: clamp(num(fieldValue("watermarkSize")) || WATERMARK_DEFAULTS.size, 20, 150),
    angle: clamp(num(fieldValue("watermarkAngle")), -90, 90),
    layout: fieldValue("watermarkLayout") === "tiled" ? "tiled" : "centred",
    color: fieldValue("watermarkColor") || "accent"
  };
}

/** The image the watermark uses, or "" (no logo yet, nothing uploaded, or text). */
export function watermarkImage(type = fieldValue("watermarkType")) {
  if (type === "logo") return state.logo;
  if (type === "image") return state.watermark;
  return "";
}

function textColour(choice) {
  if (choice === "grey") return "#6b7280";
  if (choice === "black") return "#111111";
  const hex = fieldValue("accentHex");
  return HEX.test(hex) ? hex : fieldValue("accent") || "#46b751";
}

/** Centres of the printed pages for an invoice of the given height. */
export function pageCentres(heightMm, firstPage = 297, nextPage = firstPage - NEXT_PAGE_TOP_MARGIN_MM) {
  const extra = Math.max(0, heightMm - firstPage);
  const pages = 1 + Math.ceil(extra / nextPage - 0.001);
  return Array.from({ length: pages }, (_, i) =>
    i === 0 ? firstPage / 2 : firstPage + (i - 1) * nextPage + nextPage / 2);
}

/**
 * One watermark centred on (cx, cy), drawn rotated by `angle` degrees.
 * Text is fitted to exactly `width` mm (textLength), so "size" means the same
 * for text and images.
 */
function markMarkup({ text, image, width, colour }, cx, cy, angle) {
  const rotate = angle ? ` transform="rotate(${angle} ${round(cx)} ${round(cy)})"` : "";
  if (image) {
    const h = width;
    return `<image href="${esc(image)}" x="${round(cx - width / 2)}" y="${round(cy - h / 2)}" width="${round(width)}" height="${round(h)}" preserveAspectRatio="xMidYMid meet"${rotate}/>`;
  }
  const fontSize = Math.min(width / Math.max(1, text.length * 0.62), width * 0.8);
  return `<text x="${round(cx)}" y="${round(cy)}" text-anchor="middle" dominant-baseline="central" font-size="${round(fontSize)}" font-weight="800" textLength="${round(width)}" lengthAdjust="spacingAndGlyphs" fill="${colour}"${rotate}>${esc(text)}</text>`;
}

/**
 * Draws (or clears) the watermark for the given template.
 * @param {{capabilities?: {watermark?: boolean}}} template
 */
export function renderWatermark(template) {
  const host = $("pWatermark");
  const invoice = $("invoice");
  if (!host || !invoice) return;
  const s = watermarkSettings();
  const image = watermarkImage(s.type);
  const text = s.type === "text" ? s.text : "";
  const supported = Boolean(template?.capabilities?.watermark);

  if (!supported || s.type === "none" || (!image && !text)) {
    if (host.innerHTML) host.innerHTML = "";
    host.hidden = true;
    return;
  }

  const paper = paperFor(template);
  const PAGE_WIDTH_MM = paper.width;
  const heightMm = Math.max(paper.height, invoice.offsetHeight / PX_PER_MM);
  const width = PAGE_WIDTH_MM * s.size / 100;
  const mark = { text, image, width, colour: textColour(s.color) };
  let body;
  if (s.layout === "tiled") {
    const fontSize = text ? Math.min(width / Math.max(1, text.length * 0.62), width * 0.8) : 0;
    const tileW = width * 1.35;
    const tileH = text ? Math.max(fontSize * 3, 30) : width * 1.25;
    body =
      `<defs><pattern id="saWatermarkTiles" patternUnits="userSpaceOnUse" width="${round(tileW)}" height="${round(tileH)}"` +
      `${s.angle ? ` patternTransform="rotate(${s.angle})"` : ""}>` +
      markMarkup(mark, tileW / 2, tileH / 2, 0) +
      `</pattern></defs><rect x="0" y="0" width="${PAGE_WIDTH_MM}" height="${round(heightMm)}" fill="url(#saWatermarkTiles)"/>`;
  } else {
    const bottom = template?.capabilities?.printMargins?.bottom || 0;
    const first = paper.height - bottom;
    body = pageCentres(heightMm, first, first - NEXT_PAGE_TOP_MARGIN_MM).map(cy => markMarkup(mark, PAGE_WIDTH_MM / 2, cy, s.angle)).join("");
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${PAGE_WIDTH_MM} ${round(heightMm)}" preserveAspectRatio="xMidYMin meet" focusable="false">` +
    `<g opacity="${s.opacity}">${body}</g></svg>`;
  if (host.innerHTML !== svg) host.innerHTML = svg;
  host.hidden = false;
}
