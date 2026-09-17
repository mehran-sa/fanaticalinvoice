/** Sidebar tab navigation. */

import { qsa } from "../utils.js";

export function initTabs() {
  qsa(".tab").forEach(tab => {
    tab.onclick = () => {
      qsa(".tab").forEach(x => x.classList.toggle("active", x === tab));
      qsa(".tabpane").forEach(x => x.classList.toggle("active", x.id === "tab-" + tab.dataset.tab));
    };
  });
}
