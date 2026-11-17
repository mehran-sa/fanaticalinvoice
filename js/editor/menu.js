/**
 * The toolbar's "More" menu (Print, Export JSON, Import JSON, Reset text).
 *
 * Mouse: click More, then an item; clicking elsewhere closes it.
 * Keyboard: Enter/Space/Down on More opens it with the first item focused,
 * Up/Down move, Home/End jump, Escape closes and returns to More, Tab leaves.
 */

import { $ } from "../utils.js";

export function initMoreMenu() {
  const button = $("moreBtn");
  const menu = $("moreMenu");
  if (!button || !menu) return;
  const items = () => [...menu.querySelectorAll(".menu-item")];

  const open = (focusFirst = false) => {
    menu.hidden = false;
    // Open towards whichever side has room inside the sidebar, which clips
    // anything that sticks out.
    menu.classList.remove("align-right");
    const bounds = (button.closest(".sidebar") || document.body).getBoundingClientRect();
    if (menu.getBoundingClientRect().right > bounds.right - 8) menu.classList.add("align-right");
    button.setAttribute("aria-expanded", "true");
    if (focusFirst) items()[0]?.focus();
  };
  const close = (returnFocus = false) => {
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (returnFocus) button.focus();
  };

  button.addEventListener("click", () => (menu.hidden ? open() : close()));
  button.addEventListener("keydown", e => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      open(true);
    }
  });

  menu.addEventListener("keydown", e => {
    const list = items();
    const index = list.indexOf(document.activeElement);
    const move = i => list[(i + list.length) % list.length].focus();
    if (e.key === "ArrowDown") { e.preventDefault(); move(index + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(index - 1); }
    else if (e.key === "Home") { e.preventDefault(); move(0); }
    else if (e.key === "End") { e.preventDefault(); move(list.length - 1); }
    else if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "Tab") close();
  });

  // Each item's own handler runs first (it is attached with onclick); the menu
  // then closes.
  menu.addEventListener("click", e => {
    if (e.target.closest(".menu-item")) close();
  });
  document.addEventListener("pointerdown", e => {
    if (!menu.hidden && !menu.contains(e.target) && !button.contains(e.target)) close();
  });
}
