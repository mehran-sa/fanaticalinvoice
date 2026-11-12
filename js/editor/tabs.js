/**
 * Sidebar tabs: Invoice, Saved and Design.
 *
 * They follow the ARIA tabs pattern: Left/Right (and Home/End) move between
 * tabs, and only the selected tab is in the Tab order.
 */

import { qsa } from "../utils.js";

const tabs = () => qsa(".tab");

/** Shows the tab with the given name ("invoice", "invoices" or "design"). */
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
