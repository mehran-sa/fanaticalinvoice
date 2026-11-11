/**
 * Narrow screens: the preview sits below a long editor. A floating button
 * jumps to the preview ("Preview") and back to the editor ("Edit"), depending
 * on which one is on screen.
 */

import { $ } from "../utils.js";

export function initJumpButton() {
  const button = $("jumpBtn");
  const stage = $("invoiceStage");
  const sidebar = $("sidebar");
  if (!button || !stage || !sidebar || !("IntersectionObserver" in window)) return;

  let previewVisible = false;
  const render = () => {
    button.textContent = previewVisible ? "\u2191 Edit" : "Preview \u2193";
    button.setAttribute("aria-label", previewVisible ? "Back to the editor" : "Go to the invoice preview");
  };
  new IntersectionObserver(entries => {
    previewVisible = entries[0].isIntersecting;
    render();
  }, { threshold: 0.15 }).observe(stage);

  button.onclick = () => {
    (previewVisible ? sidebar : $("invoiceStage").closest(".workspace")).scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const sync = () => { button.hidden = window.innerWidth > 1180; };
  window.addEventListener("resize", sync);
  sync();
  render();
}
