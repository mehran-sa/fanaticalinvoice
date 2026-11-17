"""
Long invoices (royalty statements with hundreds of lines) stay correct and
quick to edit. Headless Chromium against the local server:

    python3 tests/e2e_long_invoice.py

Checks the preview after each kind of edit (it is now redrawn in part, and
after a short pause in typing), and that typing and adding a line stay fast.
Time limits are generous so a slow machine does not fail them; the numbers
are printed for comparison.
"""

import os, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("E2E_PORT", "8783"))
URL = f"http://127.0.0.1:{PORT}/index.html"
LINES = 1000
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail else ""))


server = subprocess.Popen([sys.executable, os.path.join(ROOT, "serve.py"), str(PORT), "--no-browser"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
errors = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(URL)
        page.wait_for_timeout(400)
        page.evaluate("""async n => {
            const s = await import('/js/session.js'); const d = await import('/js/invoice/invoice-data.js');
            const snap = d.serialize();
            snap.items = Array.from({length: n}, (_, i) => ({description: 'Statement line ' + i, quantity: 1 + (i % 5), rate: 12.5}));
            s.applySnapshot(snap);
        }""", LINES)
        page.wait_for_timeout(400)
        rows = lambda: page.locator("#pItems tr").count()
        cell = lambda r, c: page.locator("#pItems tr").nth(r).locator("td").nth(c).text_content()
        check(f"{LINES} lines are shown in the preview", rows() == LINES)

        # Typing in a header field: rows untouched, header updated.
        page.click("#tabbtn-invoice")
        page.focus("#invoiceNumber")
        page.keyboard.press("End")
        start = time.time()
        page.keyboard.type("-LONG", delay=0)
        typing_ms = (time.time() - start) * 1000 / 5
        page.wait_for_timeout(400)
        check("typing a header field updates the preview", "-LONG" in page.text_content("#invoice"))
        check(f"typing stays quick on {LINES} lines", typing_ms < 60, f"{typing_ms:.0f} ms per key")
        check("the rows are unchanged", rows() == LINES and "Statement line 999" in cell(999, 1))

        # Typing in one line: that row and the totals change.
        total_before = page.text_content("#pTotal")
        box = page.locator("#itemsEditor .itemrow").nth(3).locator("input[type=number]").first
        box.scroll_into_view_if_needed()
        box.fill("100")
        page.wait_for_timeout(400)
        check("editing a line updates its row in the preview", "100" in cell(3, 2) and "Statement line 3" in cell(3, 1), cell(3, 2))
        check("editing a line updates the total", page.text_content("#pTotal") != total_before)
        check("other rows are unchanged", "Statement line 4" in cell(4, 1) and "Statement line 2" in cell(2, 1))

        # Adding a line appends one row without rebuilding the editor.
        page.evaluate("() => { document.querySelector('#itemsEditor .itemrow').dataset.marker = 'kept'; }")
        start = time.time()
        page.click("#addItemBtn")
        add_ms = (time.time() - start) * 1000
        page.wait_for_timeout(200)
        check("adding a line adds one row to the editor and the preview",
              page.locator("#itemsEditor .itemrow").count() == LINES + 1 and rows() == LINES + 1)
        check("adding a line keeps the other editor rows (no rebuild)",
              page.evaluate("() => document.querySelector('#itemsEditor .itemrow').dataset.marker") == "kept")
        check("the new line has the cursor", page.evaluate("() => document.activeElement.closest('.itemrow') === document.querySelector('#itemsEditor .itemrow:last-child')"))
        check("the line above it can now move down",
              page.locator("#itemsEditor .itemrow").nth(LINES - 1).locator(".move-down").is_enabled()
              and page.locator("#itemsEditor .itemrow").nth(LINES).locator(".move-down").is_disabled())
        check(f"adding a line stays quick on {LINES} lines", add_ms < 400, f"{add_ms:.0f} ms")
        page.keyboard.type("Brand new line")
        page.wait_for_timeout(400)
        check("typing in the new line shows in the preview", "Brand new line" in cell(LINES, 1))

        # Removing a line rebuilds correctly.
        page.locator("#itemsEditor .itemrow").nth(0).locator(".remove").click()
        page.wait_for_timeout(300)
        check("removing a line updates the preview", rows() == LINES and "Statement line 1" in cell(0, 1))

        # Undo after the partial redraws still matches.
        page.keyboard.press("Control+z")
        page.wait_for_timeout(400)
        check("undo restores the removed line", rows() == LINES + 1 and "Statement line 0" in cell(0, 1))

        # Export uses the latest text even straight after typing.
        page.focus("#reference")
        page.keyboard.type("PO-9")
        # (On a long invoice the preview waits for a pause in typing; printing
        # must not use the older preview.)
        printed = page.evaluate("""async () => { const p = await import('/js/print/print.js');
            const frame = p.buildInvoicePrintDocument(false); const text = frame?.contentDocument?.body?.textContent || '';
            frame?.remove(); return text; }""")
        check("printing straight after typing includes the last keystroke", "PO-9" in printed)

        browser.close()
finally:
    server.terminate()

check("no page errors", not errors, "; ".join(errors[:3]))
print(f"\n{sum(results)} passed, {len(results) - sum(results)} failed")
sys.exit(0 if all(results) else 1)
