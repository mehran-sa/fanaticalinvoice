/** Design tab: accent colour, logo upload and sizing, zoom. */

import { $, setText, safeColor, toast, num } from "../utils.js";
import { LIMITS, LOGO_HINT_DEFAULT } from "../constants.js";
import { state, setLogo, setZoom } from "../state.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
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

export function initLogoControls() {
  $("logoFile").onchange = e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > LIMITS.logoBytes) { toast("Logo must be under 3 MB."); e.target.value = ""; return; }
    if (!/^image\//.test(file.type)) { toast("Please select a valid image file."); e.target.value = ""; return; }

    const reader = new FileReader();
    reader.onerror = () => toast("The logo could not be read.");
    reader.onload = () => {
      // Decode before accepting so a corrupt file never reaches the preview.
      const probe = new Image();
      probe.onerror = () => toast("The selected logo image is not valid.");
      probe.onload = () => {
        setLogo(String(reader.result));
        setText("logoHint", file.name + " added");
        renderPreview();
        saveInvoice();
        toast("Logo added.");
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

export function initZoomControls() {
  const zoomBy = delta => {
    setZoom(state.zoom + delta);
    renderPreview();
    saveInvoice();
  };
  $("zoomIn").onclick = () => zoomBy(LIMITS.zoom.step);
  $("zoomOut").onclick = () => zoomBy(-LIMITS.zoom.step);
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
