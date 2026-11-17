/**
 * Sidebar tabs: Invoice and Design.
 *
 * They follow the ARIA tabs pattern: Left/Right (and Home/End) move between
 * tabs, and only the selected tab is in the Tab order.
 */

import { qsa } from "../utils.js";

const tabs = () => qsa(".tab");

/** Shows the tab with the given name ("invoice" or "design"). */
export function selectTab(name, { focus = false } = {}) {
  for (const tab of tabs()) {
    const selected = tab.dataset.tab === name;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  qsa(".tabpane").forEach(pane => pane.classList.toggle("active", pane.id === "tab-" + name));
}

/** Shows whichever tab and collapsed panel contain the element. */
export function revealElement(el) {
  const pane = el?.closest(".tabpane");
  if (pane) selectTab(pane.id.replace(/^tab-/, ""));
  const panel = el?.closest("details");
  if (panel && !panel.open) panel.open = true;
}

export function initTabs() {
  tabs().forEach((tab, index) => {
    tab.onclick = () => selectTab(tab.dataset.tab);
    tab.onkeydown = e => {
      const list = tabs();
      let next = null;
      if (e.key === "ArrowRight") next = list[(index + 1) % list.length];
      else if (e.key === "ArrowLeft") next = list[(index - 1 + list.length) % list.length];
      else if (e.key === "Home") next = list[0];
      else if (e.key === "End") next = list[list.length - 1];
      if (!next) return;
      e.preventDefault();
      selectTab(next.dataset.tab, { focus: true });
    };
  });
}

/**
 * Scrolls the editor column to an element. On wide screens only the editor
 * scrolls, so the invoice preview beside it stays where it is.
 */
export function scrollEditorTo(el, { block = "start", smooth = true } = {}) {
  if (!el) return;
  const sidebar = document.getElementById("sidebar");
  const ownScroll = sidebar && getComputedStyle(sidebar).overflowY !== "visible" && sidebar.scrollHeight > sidebar.clientHeight;
  if (!ownScroll) {
    el.scrollIntoView({ block, behavior: smooth ? "smooth" : "auto" });
    return;
  }
  const top = el.getBoundingClientRect().top - sidebar.getBoundingClientRect().top + sidebar.scrollTop;
  const tabs = sidebar.querySelector(".tabs")?.offsetHeight || 0;
  const target = block === "center" ? top - (sidebar.clientHeight - el.offsetHeight) / 2 : top - tabs - 12;
  sidebar.scrollTo({ top: Math.max(0, target), behavior: smooth ? "smooth" : "auto" });
}
