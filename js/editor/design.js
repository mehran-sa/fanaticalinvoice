/** Design tab: accent colour, logo upload and sizing, zoom. */

import { $, setText, safeColor, toast, num, toastError, fieldValue } from "../utils.js";
import { LIMITS, LOGO_HINT_DEFAULT } from "../constants.js";
import { state, setLogo, setZoom } from "../state.js";
import { renderPreview, applyZoom } from "../invoice/invoice-renderer.js";
import { renderWatermark } from "../invoice/watermark.js";
import * as TemplateRegistry from "../templates/template-registry.js";
import { saveInvoice } from "../storage/invoice-storage.js";

/** Applies an accent colour to the CSS custom properties and both inputs. */
export function setAccent(value) {
  const color = safeColor(value);
  const hex = color.slice(1);
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)).join(",");
  document.documentElement.style.setProperty("--accent", color);
  document.documentElement.style.setProperty("--accent-rgb", rgb);
  $("accent").value = color;
  $("accentHex").value = color;
}

/**
 * Scales a large raster logo down so its longest side is LIMITS.logoMaxSide.
 *
 * The logo prints at most 240 x 140 CSS px, so 1200 px is still sharp at print
 * resolution. The whole invoice, logo included, is stored on every save and
 * copied into saved templates and brands, so a multi-megabyte photo made each
 * save slow and could fill browser storage. SVG logos are left untouched.
 *
 * @returns {string|null} the smaller data URL, or null to keep the original
 */
export function shrinkLogo(image, type, originalDataUrl) {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(type)) return null;
  const { naturalWidth: w, naturalHeight: h } = image;
  const longest = Math.max(w, h);
  if (!longest || longest <= LIMITS.logoMaxSide) return null;
  const scale = LIMITS.logoMaxSide / longest;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    // JPEG and WebP stay lossy at high quality; PNG and GIF become PNG, which
    // keeps transparency.
    const outType = type === "image/jpeg" || type === "image/webp" ? type : "image/png";
    const result = canvas.toDataURL(outType, 0.92);
    return result.startsWith("data:image/") && result.length < originalDataUrl.length ? result : null;
  } catch {
    return null;
  }
}

export function initLogoControls() {
  $("logoFile").onchange = e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > LIMITS.logoBytes) { toast("Logo must be under 3 MB."); e.target.value = ""; return; }
    if (!/^image\//.test(file.type)) { toast("Please select a valid image file."); e.target.value = ""; return; }

    const reader = new FileReader();
    reader.onerror = () => toastError("The logo could not be read.");
    reader.onload = () => {
      // Decode before accepting so a corrupt file never reaches the preview.
      const probe = new Image();
      probe.onerror = () => toastError("The selected logo image is not valid.");
      probe.onload = () => {
        const original = String(reader.result);
        const shrunk = shrinkLogo(probe, file.type, original);
        setLogo(shrunk || original);
        setText("logoHint", file.name + " added");
        renderPreview();
        saveInvoice();
        toast(shrunk
          ? `Logo added and resized to at most ${LIMITS.logoMaxSide} px, which keeps saving fast.`
          : "Logo added.");
      };
      probe.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  $("removeLogoBtn").onclick = () => {
    setLogo("");
    $("logoFile").value = "";
    setText("logoHint", LOGO_HINT_DEFAULT);
    renderPreview();
    saveInvoice();
    toast("Logo removed.");
  };
}

/** True while the preview should keep fitting its space (after Fit, or on a narrow screen). */
let fitting = false;

/** The zoom at which the whole page width fits the preview area (at most 100%). */
function fitZoom() {
  const inv = $("invoice");
  const workspace = inv.closest(".workspace");
  if (!workspace || !inv.offsetWidth) return state.zoom;
  const style = getComputedStyle(workspace);
  const room = workspace.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  return Math.min(1, Math.floor((room / inv.offsetWidth) * 100) / 100);
}

function fitPreview() {
  setZoom(fitZoom());
  applyZoom();
}

export function initZoomControls() {
  const zoomBy = delta => {
    fitting = false;
    setZoom(Math.round((state.zoom + delta) * 10) / 10);
    renderPreview();
    saveInvoice();
  };
  $("zoomIn").onclick = () => zoomBy(LIMITS.zoom.step);
  $("zoomOut").onclick = () => zoomBy(-LIMITS.zoom.step);
  $("zoomFit").onclick = () => {
    fitting = true;
    fitPreview();
    saveInvoice();
  };

  // Keep the stage the right size when the page grows or shrinks (a logo
  // loading, items added), and keep fitting while the window changes size.
  if ("ResizeObserver" in window) {
    new ResizeObserver(() => {
      applyZoom();
      renderWatermark(TemplateRegistry.get(fieldValue("template")));
    }).observe($("invoice"));
  }
  let timer = null;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (fitting) fitPreview(); }, 120);
  });
}

/**
 * On narrow screens the page starts fitted to the screen width. Not saved:
 * it is a view setting for this screen only.
 */
export function fitPreviewOnNarrowScreens() {
  if (window.innerWidth > 1180) return;
  fitting = true;
  fitPreview();
}

/** Ensures the range inputs have a value before the first render. */
export function applyLogoDefaults() {
  if (!$("logoWidth").value) $("logoWidth").value = String(LIMITS.logoWidth.fallback);
  if (!$("logoHeight").value) $("logoHeight").value = String(LIMITS.logoHeight.fallback);
}

export const currentLogoSize = () => ({
  width: num($("logoWidth").value),
  height: num($("logoHeight").value),
  logo: state.logo
});
