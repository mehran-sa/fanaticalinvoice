/**
 * Watermark panel in the Design tab: shows only the settings that apply to
 * the chosen kind, labels the sliders, handles the image upload, and says when
 * the current template does not show watermarks.
 */

import { $, qsa, fieldValue, setText, toast, toastError } from "../utils.js";
import { LIMITS } from "../constants.js";
import { state, setWatermark } from "../state.js";
import * as TemplateRegistry from "../templates/template-registry.js";
import { renderPreview } from "../invoice/invoice-renderer.js";
import { saveInvoice, onInvoiceWritten } from "../storage/invoice-storage.js";
import { shrinkLogo } from "./design.js";

const KIND_LABEL = { none: "Off", text: "Text", logo: "Logo", image: "Image" };

export function updateWatermarkControls() {
  const type = fieldValue("watermarkType") || "none";
  qsa("[data-wm]").forEach(row => {
    const want = row.dataset.wm;
    row.hidden = !(want === "any" ? type !== "none" : want === type);
  });
  setText("watermarkOpacityValue", fieldValue("watermarkOpacity") + "%");
  setText("watermarkSizeValue", fieldValue("watermarkSize") + "% of the page width");
  $("removeWatermarkBtn").hidden = !state.watermark;
  setText("watermarkLogoHint", state.logo ? "Uses the logo from Your company." : "Upload a logo under Your company first.");

  const supported = Boolean(TemplateRegistry.get(fieldValue("template"))?.capabilities?.watermark);
  $("watermarkTemplateHint").hidden = supported || type === "none";

  let summary = KIND_LABEL[type] || "Off";
  if (type === "text" && fieldValue("watermarkText").trim()) summary = "Text: " + fieldValue("watermarkText").trim();
  if (type !== "none" && !supported) summary += " (not on this template)";
  setText("sumWatermark", summary);
}

export function initWatermarkControls() {
  const input = $("watermarkFile");
  if (!input) return;

  input.onchange = () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    if (file.size > LIMITS.logoBytes) return toastError("The watermark image is larger than 3 MB.");
    const reader = new FileReader();
    reader.onerror = () => toastError("The watermark image could not be read.");
    reader.onload = () => {
      const probe = new Image();
      probe.onerror = () => toastError("The selected watermark image is not valid.");
      probe.onload = () => {
        const original = String(reader.result);
        setWatermark(shrinkLogo(probe, file.type, original) || original);
        $("watermarkType").value = "image";
        updateWatermarkControls();
        renderPreview();
        saveInvoice();
        toast("Watermark image added.");
      };
      probe.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  $("removeWatermarkBtn").onclick = () => {
    setWatermark("");
    updateWatermarkControls();
    renderPreview();
    saveInvoice();
    toast("Watermark image removed.");
  };

  // Follow every change: the kind, sliders, template, brand loads, opening
  // another invoice, undo.
  let timer = null;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(updateWatermarkControls, 60); };
  for (const type of ["input", "change", "click"]) document.addEventListener(type, schedule, true);
  onInvoiceWritten(schedule);
  updateWatermarkControls();
}
