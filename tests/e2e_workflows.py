"""
End-to-end workflow checks for SA Invoice Generator in headless Chromium.

Optional tooling: needs Python 3 and Playwright
(pip install playwright && playwright install chromium). The app itself has no
dependencies. Run from the project folder:

    python3 tests/e2e_workflows.py

The script serves the folder on 127.0.0.1, drives the real UI, and fails if any
request leaves 127.0.0.1, if the page logs an error, or if a workflow check
fails. Screenshots are written to tests/output/.
"""

import json, os, subprocess, sys, time, tempfile, zipfile, io, struct, zlib, re

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tests", "output")
os.makedirs(OUT, exist_ok=True)
OUT_PREFIX = "single-" if os.environ.get("E2E_TARGET") == "single" else ""
PORT = int(os.environ.get("E2E_PORT", "8781"))
# E2E_TARGET=single tests the built SA-Invoice-Generator.html opened from disk
# (file://) instead of index.html served over HTTP.
SINGLE = os.environ.get("E2E_TARGET") == "single"
if SINGLE:
    ORIGIN = "file://"
    URL = "file://" + os.path.join(ROOT, "SA-Invoice-Generator.html")
else:
    ORIGIN = f"http://127.0.0.1:{PORT}"
    URL = ORIGIN + "/index.html"
FIX = tempfile.mkdtemp(prefix="sa-invoice-e2e-")

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))


# ----------------------------------------------------------------- fixtures

def png_bytes(w=8, h=8):
    raw = b"".join(b"\x00" + b"\x22\x66\xcc" * w for _ in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))


def write(name, data, mode="w"):
    path = os.path.join(FIX, name)
    with open(path, mode) as f:
        f.write(data)
    return path


def xlsx(rows):
    """Minimal valid .xlsx with inline strings, built without any library."""
    def cell(ref, v):
        if isinstance(v, (int, float)):
            return f'<c r="{ref}"><v>{v}</v></c>'
        v = str(v).replace("&", "&amp;").replace("<", "&lt;")
        return f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">{v}</t></is></c>'
    sheet_rows = "".join(
        f'<row r="{r+1}">' + "".join(cell(f"{chr(65+c)}{r+1}", v) for c, v in enumerate(row)) + "</row>"
        for r, row in enumerate(rows))
    files = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        "xl/worksheets/sheet1.xml": f'<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>{sheet_rows}</sheetData></worksheet>',
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for n, d in files.items():
            z.writestr(n, d)
    return buf.getvalue()


LOGO = write("logo.png", png_bytes(), "wb")


def noise_png(w, h):
    raw = b"".join(b"\x00" + os.urandom(w * 3) for _ in range(h))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 0)) + chunk(b"IEND", b""))


BIG_LOGO = write("big-logo.png", noise_png(1300, 700), "wb")
ITEMS_XLSX = write("items.xlsx", xlsx([
    ["Royalty statement"], [],
    ["SKU", "Name", "Net Qty", "Royalty"],
    ["S1", "Course one", 2, 30.5],
    ["S2", "Course two", 1, 9.99],
    [], ["Total royalty", "", "", 40.49]]), "wb")
BUNDLE_XLSX = write("bundles.xlsx", xlsx([
    ["SKU", "Name", "Net Qty", "Royalty"],
    ["1", "Alpha course\n in Mega Bundle", 3, 12.25],
    ["2", "Beta course\n in Mega Bundle", 1, 7.75],
    ["3", "Gamma course\n in Small Bundle", 2, 5],
    ["", "Total royalty", "", 25]]), "wb")
MISMATCH_CSV = write("mismatch.csv", "Name,Royalty\nCourse A,10\nCourse B,5\n\nTotal royalty,20\n")
CSV = write("items.csv", 'SKU,Description,Qty,Rate\nA1,"Widget, large",2,"1,234.50"\nA2,Gadget,1,£99.99\n')
NOT_INVOICE = write("package.json", json.dumps({"name": "something-else", "version": "1.0.0"}))
BROKEN = write("broken.json", "{oops")
HOSTILE = write("hostile.json", json.dumps({
    "fields": {"invoiceNumber": "HX-1", "template": "nope"},
    "logo": "https://example.com/track.png",
    "columns": [{"key": "d", "label": "<b>Desc</b>", "width": '"><img src=x onerror=window.__pwned=1>'}],
    "items": [{"d": "<script>window.__pwned=1</script>"}]}))


# ------------------------------------------------------------------- run

server = None if SINGLE else subprocess.Popen(
    [sys.executable, os.path.join(ROOT, "serve.py"), str(PORT), "--no-browser"],
    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True,
                                  timezone_id="Europe/London")
        page = ctx.new_page()
        errors, external = [], []
        page.on("pageerror", lambda e: errors.append("pageerror: " + str(e)))
        page.on("console", lambda m: errors.append("console: " + m.text) if m.type == "error" else None)

        def on_request(r):
            if not (r.url.startswith(ORIGIN) or r.url.startswith("data:") or r.url.startswith("blob:")
                    or r.url.startswith("about:")):
                external.append(r.url)
        ctx.on("request", on_request)

        prompt_answers = []
        native_popups = []
        def on_dialog(d):
            native_popups.append(d.type)
            if d.type == "prompt":
                d.accept(prompt_answers.pop(0) if prompt_answers else "")
            else:
                d.accept()
        page.on("dialog", on_dialog)

        S = "window.SAInvoiceGenerator"
        total = lambda: page.text_content("#pTotal")
        snapshot = lambda: page.evaluate(f"() => JSON.parse(JSON.stringify({S}.serialize()))")
        def menu(item_id):
            """Runs an action from the toolbar's More menu."""
            page.click("#moreBtn")
            page.click("#" + item_id)

        def name_dialog(text):
            page.wait_for_selector("#appPromptDialog[open]")
            page.fill("#appPromptInput", text)
            page.click("#appPromptAccept")
            page.wait_for_timeout(150)

        def confirm_dialog():
            page.wait_for_selector("#appConfirmDialog[open]")
            page.click("#appConfirmAccept")
            page.wait_for_timeout(150)

        # ---- start-up: the "could not start" banner must never flash
        probe = """window.__bootFrames = []; const t = () => { const el = document.getElementById('bootError');
            window.__bootFrames.push(!!el && getComputedStyle(el).visibility === 'visible' && el.getBoundingClientRect().height > 0);
            if (window.__bootFrames.length < 90) requestAnimationFrame(t); }; requestAnimationFrame(t);"""
        cboot = browser.new_context(); pb = cboot.new_page(); pb.add_init_script(probe)
        if not SINGLE:
            pb.route("**/js/app.js", lambda route: (time.sleep(0.5), route.continue_()))  # slow script load
        pb.goto(URL); pb.wait_for_timeout(2000)
        check("start-up error banner never flashes during a normal start",
              not any(pb.evaluate("() => window.__bootFrames")) and pb.locator("#bootError").count() == 0)
        cboot.close()
        if not SINGLE:
            cfail = browser.new_context(); pfail = cfail.new_page()
            pfail.goto("file://" + os.path.join(ROOT, "index.html")); pfail.wait_for_timeout(3600)
            check("start-up error banner still appears when the app cannot start", pfail.is_visible("#bootError"))
            cfail.close()

        # ---- tabs and collapsible panels (fresh profile, first use)
        cfresh = browser.new_context(viewport={"width": 1400, "height": 900})
        cfresh.on("request", on_request)
        pf = cfresh.new_page(); pf.goto(URL); pf.wait_for_timeout(500)
        check("three tabs: Invoice, Saved, Design",
              pf.eval_on_selector_all(".tab", "t => t.map(x => x.textContent)") == ["Invoice", "Saved", "Design"])
        opened = pf.evaluate("() => Object.fromEntries([...document.querySelectorAll('details.panel')].map(d => [d.id, d.open]))")
        check("first use: everyday panels open, rarely used ones closed",
              all(opened[k] for k in ["panel-invoice", "panel-client", "panel-items", "panel-totals", "panel-footer", "panel-company"])
              and not any(opened[k] for k in ["panel-bundles", "panel-columns", "panel-sections", "panel-library"]), str(opened))
        pf.fill("#companyName", "SA Learning Ltd"); pf.fill("#paymentDetails", "Sort code 00-00-00")
        pf.click("#addItemBtn"); pf.locator(".itemrow").last.locator('[data-key="rate"]').fill("120"); pf.wait_for_timeout(500)
        check("panel summaries show what is inside",
              pf.text_content("#sumItems") == "1 item, £120.00" and pf.text_content("#sumTotals") == "Total £120.00"
              and pf.text_content("#sumColumns") == "5 of 5 shown")
        pf.reload(); pf.wait_for_timeout(500)
        check("filled-in Your company and payment panels start closed",
              not pf.evaluate("() => document.getElementById('panel-company').open")
              and not pf.evaluate("() => document.getElementById('panel-footer').open")
              and pf.text_content("#sumCompany") == "SA Learning Ltd")
        pf.click("#tabbtn-invoice"); pf.click("#panel-columns > summary"); pf.reload(); pf.wait_for_timeout(500)
        check("a panel stays open after reload once opened", pf.evaluate("() => document.getElementById('panel-columns').open"))
        pf.focus("#tabbtn-invoice"); pf.keyboard.press("ArrowRight")
        check("arrow keys move between tabs",
              pf.evaluate("() => document.activeElement.id") == "tabbtn-invoices"
              and pf.get_attribute("#tabbtn-invoices", "aria-selected") == "true")
        pf.click("#tabbtn-invoice"); pf.click("#panel-company > summary")  # open
        pf.fill("#companyName", "")
        pf.click("#panel-company > summary")  # close it again
        pf.click("#pdfBtn"); pf.wait_for_selector("#appConfirmDialog[open]"); pf.click("#appConfirmCancel"); pf.wait_for_timeout(300)
        check("Go back and fix opens a closed panel at the problem field",
              pf.evaluate("() => document.getElementById('panel-company').open && document.activeElement.id === 'companyName'"))
        # ---- speed features (same fresh profile)
        pf.click("#tabbtn-invoice")
        pf.evaluate("() => document.querySelectorAll('details.panel').forEach(d => d.open = true)")
        order = pf.evaluate("() => [...document.querySelectorAll('#tab-invoice > details')].map(d => d.id)")
        check("Invoice tab order: Invoice, Your company, Bill to, Columns, Line items, Bundle splitter, Totals, Notes",
              order == ["panel-invoice", "panel-company", "panel-client", "panel-columns", "panel-items",
                        "panel-bundles", "panel-totals", "panel-footer"], str(order))
        n_before = pf.locator(".itemrow").count()
        last = pf.locator(".itemrow").last
        last.locator('[data-key="rate"]').fill("50"); last.locator('[data-key="rate"]').press("Enter")
        check("Enter in the last line's Rate adds a line and moves to it",
              pf.locator(".itemrow").count() == n_before + 1
              and pf.evaluate("() => document.activeElement.closest('.itemrow') === document.querySelector('.itemrow:last-child')"))
        pf.locator(".itemrow").first.locator('[data-key="quantity"]').press("Enter")
        check("Enter in an earlier line moves to the next line",
              pf.evaluate("() => document.activeElement.closest('.itemrow') === document.querySelectorAll('.itemrow')[1]"))
        pf.fill("#invoiceDate", "2026-03-01"); pf.click('[data-due-days="30"]'); pf.wait_for_timeout(100)
        check("Due in 30 days sets the due date", pf.input_value("#dueDate") == "2026-03-31")
        pf.click('[data-due-days="0"]')
        check("Due on receipt uses the invoice date", pf.input_value("#dueDate") == "2026-03-01")
        check("Remove buttons only show when there is something to remove",
              pf.is_hidden("#removeClientBtn") and pf.is_hidden("#removeLogoBtn"))
        pf.click("#tabbtn-invoices")
        pf.evaluate("() => document.getElementById('sidebar').scrollTop = 0")
        pf.click("#tabbtn-invoice"); pf.evaluate("() => document.getElementById('sidebar').scrollTop = 1500"); pf.wait_for_timeout(150)
        check("toolbar and tabs stay pinned while the editor scrolls",
              0 <= pf.evaluate("() => document.getElementById('pdfBtn').getBoundingClientRect().top") < 40)
        cfresh.close()

        # ---- start-up and branding
        page.goto(URL)
        page.wait_for_timeout(500)
        # The main walkthrough uses every panel: open them all (remembered).
        page.evaluate("""() => { const all = {};
            document.querySelectorAll('details.panel').forEach(d => { d.open = true; all[d.id] = true; });
            localStorage.setItem('invoiceStudio.panelsOpen', JSON.stringify(all)); }""")
        page.wait_for_timeout(100)
        check("title is SA Invoice Generator", page.title() == "SA Invoice Generator")
        check("header shows SA Invoice Generator", page.text_content(".brand h1") == "SA Invoice Generator")
        check("start-up failure banner is removed once the app runs", page.locator("#bootError").count() == 0)
        check("page and scripts are the same release (no mixed-version warning)",
              "older version" not in (page.text_content("#toast") or ""))
        check("content security policy blocks outbound connections",
              "connect-src 'none'" in (page.get_attribute('meta[http-equiv="Content-Security-Policy"]', "content") or ""))
        inv, due = page.input_value("#invoiceDate"), page.input_value("#dueDate")
        check("due date defaults to invoice date + 14 days",
              page.evaluate("([a, b]) => (new Date(b) - new Date(a)) / 864e5", [inv, due]) == 14)

        # ---- create an invoice through the UI
        page.fill("#invoiceNumber", "INV-2001")
        page.fill("#companyName", "SA Test Ltd")
        page.fill("#clientName", "Client One\nClient Two Ltd")
        page.fill("#reference", "PO-77")
        page.fill("#paymentDetails", "Account Name: SA Test\nSort Code: 00-00-00")
        page.click("[data-tab=invoice]")
        for desc, qty, rate in [("Consulting", "3", "19.99"), ("Support", "1", "0.125"), ("Support", "1", "0.125")]:
            page.click("#addItemBtn")
            card = page.locator(".itemrow").last
            card.locator('[data-key="sku"]').fill("X")
            card.locator('[data-key="description"]').fill(desc)
            card.locator('[data-key="quantity"]').fill(qty)
            card.locator('[data-key="rate"]').fill(rate)
        page.click("[data-tab=invoice]")
        page.fill("#discount", "10")
        page.fill("#tax", "20")
        page.fill("#shipping", "4.99")
        page.wait_for_timeout(100)
        # 59.97 + 0.13 + 0.13 = 60.23; disc 6.02; taxable 54.21; tax 10.84; +4.99 = 70.04
        figures = [page.text_content(s) for s in ["#pSubtotal", "#pDiscount", "#pTax", "#pShipping", "#pTotal"]]
        page.fill("#reference", "PO-78")
        check("save indicator shows Saving while typing", page.text_content("#saveStateText") == "Saving\u2026")
        page.wait_for_timeout(500)
        check("save indicator shows Saved afterwards", page.text_content("#saveStateText").startswith("Saved"))
        page.fill("#reference", "PO-77"); page.wait_for_timeout(400)
        check("line items, discount, tax and shipping total correctly",
              figures == ["£60.23", "\u2212£6.02", "£10.84", "£4.99", "£70.04"], str(figures))
        check("balance due equals total", page.text_content("#pBalance") == "£70.04")
        check("preview shows invoice number and client lines",
              page.text_content("#pInvoiceNo") == "#INV-2001" and "Client Two Ltd" in page.text_content("#pClientName"))
        page.screenshot(path=os.path.join(OUT, OUT_PREFIX + "desktop-modern.png"), full_page=True)

        # ---- persistence across reload
        before = snapshot()
        page.reload(); page.wait_for_timeout(400)
        check("invoice persists after reload", snapshot()["fields"] == before["fields"] and snapshot()["items"] == before["items"])
        check("totals unchanged after reload", total() == "£70.04")

        # ---- edit and delete items
        page.click("[data-tab=invoice]")
        page.locator(".itemrow").first.locator('[data-key="quantity"]').fill("4")
        page.wait_for_timeout(50)
        check("item row shows its line total as you type",
              page.locator(".itemrow").first.locator(".itemrow-total").text_content() == "£79.96")
        page.locator(".itemrow").nth(1).locator("button.move-up").click(); page.wait_for_timeout(100)
        check("Move up reorders items in the editor and on the invoice",
              page.locator(".itemrow").first.locator('[data-key="rate"]').input_value() == "0.125"
              and page.eval_on_selector_all("#pItems tr", "r => r[0].textContent").find("Support") != -1)
        page.locator(".itemrow").first.locator("button.move-down").click(); page.wait_for_timeout(100)
        page.locator(".itemrow").nth(2).locator(".drag").drag_to(page.locator(".itemrow").first.locator(".drag"))
        page.wait_for_timeout(100)
        check("dragging the handle reorders items",
              page.locator(".itemrow").first.locator('[data-key="rate"]').input_value() == "0.125")
        page.locator(".itemrow").first.locator(".drag").drag_to(page.locator(".itemrow").nth(2).locator(".drag"))
        page.wait_for_timeout(100)
        check("editing a quantity updates totals", page.text_content("#pSubtotal") == "£80.22")
        page.locator(".itemrow").nth(2).locator("button.remove").click()
        check("removing an item updates the list and totals",
              page.locator(".itemrow").count() == 2 and page.text_content("#pSubtotal") == "£80.09")

        # ---- undo / redo
        page.click("#undoBtn"); page.wait_for_timeout(100)
        check("undo restores the removed item", page.locator(".itemrow").count() == 3)
        page.keyboard.press("Control+y"); page.wait_for_timeout(100)
        check("redo (Ctrl+Y) removes it again", page.locator(".itemrow").count() == 2)

        # ---- columns (on the Invoice tab since 2.10.1)
        page.click("[data-tab=invoice]")
        page.click("#addColumnBtn")
        check("add column", page.locator(".columnrow").count() == 6)
        last = page.locator(".columnrow").last
        # Typed like a user. Playwright's fill() leaves a programmatic selection
        # that stops Chromium starting the row drag below (real typing does not).
        last.locator(".labelinput").click()
        page.keyboard.press("Control+a")
        page.keyboard.type("Notes col")
        last.locator(".labelinput").dispatch_event("change")
        page.wait_for_timeout(50)
        check("rename column shows in preview", "Notes col" in page.text_content("#pHeaders"))
        last.locator(".vis").uncheck()
        check("hide column removes it from preview", "Notes col" not in page.text_content("#pHeaders"))
        first_label = page.locator(".columnrow .labelinput").first.input_value()
        page.locator(".columnrow").nth(1).locator(".drag").drag_to(page.locator(".columnrow").first.locator(".drag"))
        page.wait_for_timeout(100)
        check("drag reorders columns", page.locator(".columnrow .labelinput").first.input_value() != first_label,
              str(page.eval_on_selector_all(".columnrow .labelinput", "els => els.map(e => e.value)"))
              + " scrollTop=" + str(page.evaluate("() => document.getElementById('sidebar').scrollTop")))
        order = page.eval_on_selector_all(".columnrow .labelinput", "els => els.map(e => e.value)")
        page.evaluate("""() => { const dt = new DataTransfer(); dt.setData('text/plain', 'hello');
            document.querySelectorAll('.columnrow')[3].dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true})); }""")
        check("dropping outside text does not move a column",
              page.eval_on_selector_all(".columnrow .labelinput", "els => els.map(e => e.value)") == order)
        page.locator(".columnrow").last.locator("button").click()
        check("remove column", page.locator(".columnrow").count() == 5)
        page.click("#restoreColumnsBtn"); confirm_dialog()
        heads = page.eval_on_selector_all("#pHeaders th", "els => els.map(e => e.textContent)")
        check("restore default columns", heads == ["SKU", "Description", "Qty", "Rate", "Amount"], str(heads))
        check("totals survive column changes", page.text_content("#pSubtotal") == "£80.09")

        # ---- design tab: templates, accent, logo, sections
        page.click("[data-tab=design]")
        for tpl in ["minimal", "classic", "royalty", "modern"]:
            page.select_option("#template", tpl)
            page.wait_for_timeout(80)
            ok = page.get_attribute("#invoice", "class") == "invoice template-" + tpl
            if tpl == "classic":
                ok = ok and "Total" in (page.text_content("#pClassicTotals") or "")
                page.screenshot(path=os.path.join(OUT, OUT_PREFIX + "desktop-classic.png"), full_page=True)
            check(f"template '{tpl}' renders", ok)
        page.fill("#accentHex", "")
        page.type("#accentHex", "#ff0000")
        page.wait_for_timeout(50)
        check("accent HEX can be typed character by character",
              page.input_value("#accentHex") == "#ff0000" and page.input_value("#accent") == "#ff0000")
        check("StaffAsia interface stays green when the invoice accent changes",
              page.evaluate("() => getComputedStyle(document.getElementById('pdfBtn')).backgroundColor") == "rgb(70, 183, 81)"
              and page.evaluate("() => getComputedStyle(document.querySelector('.tab.active')).borderBottomColor") == "rgb(70, 183, 81)")
        check("brand fonts load from the app (Epilogue headings, Poppins interface)",
              page.evaluate("() => document.fonts.check('700 16px Epilogue') && document.fonts.check('600 12px Poppins')")
              and page.evaluate("() => getComputedStyle(document.querySelector('.brand-title h1')).fontFamily").startswith("Epilogue"))
        check("the invoice keeps its own template font",
              page.evaluate("() => getComputedStyle(document.getElementById('invoice')).fontFamily").startswith("Inter"))
        page.set_input_files("#logoFile", LOGO)
        page.wait_for_timeout(400)
        check("logo upload shows in preview", (page.get_attribute("#pLogo", "src") or "").startswith("data:image/png"))
        toggle = page.locator('.switch:has([data-section-toggle="client"])')
        toggle.scroll_into_view_if_needed(); toggle.click()
        check("section toggle hides client block",
              "section-hidden" in (page.get_attribute('#invoice [data-section="client"]', "class") or ""))
        toggle.click()

        # ---- template and brand library
        page.click("#saveTemplateBtn")
        page.wait_for_selector("#appPromptDialog[open]")
        page.click("#appPromptAccept")  # empty name
        check("template name is required, shown in the dialog", page.is_visible("#appPromptError"))
        page.fill("#appPromptInput", "Monthly"); page.click("#appPromptAccept"); page.wait_for_timeout(150)
        check("save template", "Monthly" in page.text_content("#savedTemplates"))
        page.click("#saveTemplateBtn"); name_dialog("monthly")
        page.wait_for_selector("#templateOverwriteDialog[open]")
        page.click("#templateOverwriteConfirm"); page.wait_for_timeout(100)
        check("overwrite template keeps a single entry",
              page.locator("#savedTemplates .library-item").count() == 1)
        page.click("#saveBrandBtn"); name_dialog("SA Brand")
        check("save brand", "SA Brand" in page.text_content("#savedBrands"))
        page.click("[data-tab=invoice]")
        page.fill("#companyName", "Changed Co")
        page.fill("#clientName", "Keep This Client")
        page.click("[data-tab=design]")
        page.locator("#savedBrands .library-item button", has_text="Load").click(); page.wait_for_timeout(100)
        check("load brand restores seller but keeps client",
              page.input_value("#companyName") == "SA Test Ltd" and page.input_value("#clientName") == "Keep This Client")
        page.locator("#savedTemplates .library-item button", has_text="Load").click(); page.wait_for_timeout(150)
        check("load template restores the saved invoice", page.input_value("#clientName").startswith("Client One"))
        page.click("[data-tab=invoice]")

        # ---- export JSON, then import into a clean browser profile
        exported = snapshot()
        with page.expect_download() as dl:
            menu("exportBtn")
        json_path = os.path.join(FIX, dl.value.suggested_filename)
        dl.value.save_as(json_path)
        check("export JSON filename uses invoice number", dl.value.suggested_filename == "INV-2001.json")

        ctx2 = browser.new_context(viewport={"width": 1400, "height": 900})
        ctx2.on("request", on_request)
        p2 = ctx2.new_page()
        p2.on("pageerror", lambda e: errors.append("pageerror(2): " + str(e)))
        p2.goto(URL); p2.wait_for_timeout(300)
        p2.set_input_files("#jsonFile", json_path); p2.wait_for_timeout(300)
        imported = p2.evaluate(f"() => JSON.parse(JSON.stringify({S}.serialize()))")
        # The imported copy is a new saved invoice, so its id differs.
        strip = lambda s: {k: v for k, v in s.items() if k not in ("zoom", "invoiceId")}
        check("JSON import reproduces the exported invoice exactly", strip(imported) == strip(exported))
        check("imported totals match", p2.text_content("#pTotal") == total())
        for path, label in [(BROKEN, "broken JSON"), (NOT_INVOICE, "non-invoice JSON")]:
            p2.set_input_files("#jsonFile", path); p2.wait_for_timeout(200)
            after = p2.evaluate(f"() => JSON.parse(JSON.stringify({S}.serialize()))")
            check(f"{label} is rejected and leaves the invoice unchanged",
                  strip(after) == strip(imported), p2.text_content("#toast"))
        p2.set_input_files("#jsonFile", HOSTILE); p2.wait_for_timeout(300)
        check("hostile JSON: no script ran, no remote logo, markup shown as text",
              not p2.evaluate("() => window.__pwned") and p2.get_attribute("#pLogo", "src") is None
              and "<script>" in p2.text_content("#pItems"))
        ctx2.close()

        # ---- spreadsheet imports (CSV and bundled Excel reader)
        page.click("[data-tab=invoice]")
        page.set_input_files("#sheetFile", CSV); page.wait_for_timeout(300)
        check("CSV import with formatted amounts", page.text_content("#pSubtotal") == "£2,568.99", page.text_content("#pSubtotal"))
        page.set_input_files("#sheetFile", ITEMS_XLSX); page.wait_for_timeout(1200)
        check("Excel parser stays in its worker (no XLSX object in the page)",
              page.evaluate("() => typeof window.XLSX") == "undefined")
        check("statement check: imported lines match the statement total",
              "matching the statement" in page.text_content("#importCheck")
              and "ok" in page.get_attribute("#importCheck", "class"))
        check("XLSX import (local SheetJS) skips preamble and footer rows",
              page.locator(".itemrow").count() == 2 and page.text_content("#pSubtotal") == "£40.49",
              page.text_content("#pSubtotal"))

        page.set_input_files("#sheetFile", MISMATCH_CSV); page.wait_for_timeout(300)
        check("statement check: a missing row is flagged with the difference",
              "warn" in page.get_attribute("#importCheck", "class") and "£20.00" in page.text_content("#importCheck")
              and "£15.00" in page.text_content("#importCheck"), page.text_content("#importCheck"))

        # ---- bundle splitter
        page.click("[data-tab=invoice]")
        page.set_input_files("#bundleFile", BUNDLE_XLSX); page.wait_for_timeout(800)
        check("bundle sheet grouped (total row not read as a course)", page.locator(".bundle-group").count() == 2)
        check("bundle statement total matches", "matching the statement" in page.text_content("#bundleStatus"))
        page.click("#bundleSummaryViewBtn")
        check("bundle summary total", "25.00" in page.text_content("#bundleResults"))
        with page.expect_download() as dl:
            page.click("#bundleDownloadBtn")
        csv_text = open(dl.value.path(), encoding="utf-8-sig").read()
        check("bundle CSV download", "Mega Bundle" in csv_text and "20.00" in csv_text and "25.00" in csv_text)
        page.click("#applyBundlesBtn"); confirm_dialog()
        check("apply bundles to invoice", page.text_content("#pSubtotal") == "£25.00")

        # ---- print / PDF
        page.click("[data-tab=invoice]")
        page.fill("#invoiceNumber", "INV-PDF")
        menu("printBtn")
        page.wait_for_selector("#appConfirmDialog[open]")
        listed = page.text_content("#appConfirmList")
        check("export check lists placeholder text that would print",
              "company details are empty" in listed and "Check before you print" in page.text_content("#appConfirmTitle"), listed)
        page.click("#appConfirmAccept")  # Print anyway
        frame_html = None
        for _ in range(40):
            frame_html = page.evaluate("""() => { const f = document.getElementById('invoicePrintFrame');
                return f && f.contentDocument && f.contentDocument.querySelector('.invoice')
                  ? f.contentDocument.documentElement.outerHTML : null; }""")
            if frame_html:
                break
            page.wait_for_timeout(50)
        editor_in_print = page.evaluate("""() => { const f = document.getElementById('invoicePrintFrame');
            const d = f && f.contentDocument; return !d || !!d.querySelector('.sidebar, button, input'); }""") if frame_html else True
        check("print builds an invoice-only document", bool(frame_html) and not editor_in_print)
        pdf_page = ctx.new_page()
        pdf_page.goto(URL)
        pdf_page.evaluate("html => { document.open(); document.write(html); document.close(); }", frame_html)
        pdf_page.wait_for_timeout(500)
        pdf_path = os.path.join(OUT, OUT_PREFIX + "invoice.pdf")
        pdf_page.pdf(path=pdf_path, prefer_css_page_size=True, print_background=True)
        pdf_page.close()
        try:
            text = subprocess.run(["pdftotext", pdf_path, "-"], capture_output=True, text=True).stdout
            check("PDF contains invoice number and total", "INV-PDF" in text and "25.00" in text, text[:200])
            check("other templates still print on A4 (595 x 842 pt)",
                  "(A4)" in subprocess.run(["pdfinfo", pdf_path], capture_output=True, text=True).stdout)
        except FileNotFoundError:
            check("PDF generated (pdftotext unavailable for content check)", os.path.getsize(pdf_path) > 1000)

        # ---- validation hint
        page.fill("#dueDate", "2000-01-01")
        check("due date before invoice date shows a warning", page.is_visible("#dueDateWarning"))
        page.fill("#dueDate", "2099-01-01")
        check("warning clears when fixed", not page.is_visible("#dueDateWarning"))

        # ---- zoom and sidebar resize
        page.click("#zoomOut")
        check("zoom out", page.text_content("#zoomLabel") == "90%")
        page.click("#zoomIn")
        box = page.locator("#sidebarResizer").bounding_box()
        page.mouse.move(box["x"] + 4, 300); page.mouse.down(); page.mouse.move(560, 300, steps=5); page.mouse.up()
        width = page.evaluate("() => document.getElementById('sidebar').getBoundingClientRect().width")
        check("sidebar can be resized by dragging", abs(width - 560) <= 2, str(width))
        page.reload(); page.wait_for_timeout(300)
        width = page.evaluate("() => document.getElementById('sidebar').getBoundingClientRect().width")
        check("sidebar width persists", abs(width - 560) <= 2, str(width))
        page.locator("#sidebarResizer").dblclick()

        # ---- reset text, then full reset
        menu("resetTextBtn"); confirm_dialog()
        s = snapshot()
        check("reset text clears text but keeps amounts and invoice number",
              s["fields"]["companyName"] == "" and s["fields"]["invoiceNumber"] == "INV-PDF"
              and page.text_content("#pSubtotal") == "£25.00")
        check("invoice status is removed",
              page.locator("#status").count() == 0 and page.locator('[data-section="status"]').count() == 0)

        # ---- saved invoices
        tpl_before = snapshot()["fields"]["template"]
        page.click("#resetBtn"); page.wait_for_timeout(300)  # "New invoice"
        s = snapshot()
        check("New invoice: next number, no client or items, design kept",
              s["fields"]["invoiceNumber"] == "INV-PDF-1" and s["items"] == [] and s["fields"]["clientName"] == ""
              and s["fields"]["template"] == tpl_before and s["fields"]["accentHex"] == "#ff0000", str(s["fields"]["invoiceNumber"]))
        page.click("#pdfBtn")
        page.wait_for_selector("#appConfirmDialog[open]")
        page.click("#appConfirmCancel"); page.wait_for_timeout(300)
        check("export check: Go back and fix opens the first problem field",
              page.evaluate("() => document.activeElement.id") == "companyName"
              and "active" in page.get_attribute('[data-tab="invoice"]', "class"))
        page.focus("#moreBtn"); page.keyboard.press("ArrowDown")
        check("More menu opens from the keyboard with the first item focused",
              page.evaluate("() => document.activeElement.id") == "printBtn")
        page.keyboard.press("Escape")
        check("Escape closes the menu and returns to More",
              page.is_hidden("#moreMenu") and page.evaluate("() => document.activeElement.id") == "moreBtn")
        page.click("[data-tab=invoices]")
        rows = page.locator("#invoiceList .invoice-row")
        check("both invoices are in the saved list", rows.count() == 2, str(rows.count()))
        page.locator("#invoiceList .invoice-row", has_text="INV-PDF").filter(has_not_text="INV-PDF-1").locator("button", has_text="Open").click()
        page.wait_for_timeout(200)
        check("opening a saved invoice restores it", page.input_value("#invoiceNumber") == "INV-PDF"
              and page.text_content("#pSubtotal") == "£25.00")
        check("undo history starts fresh for the opened invoice", page.is_disabled("#undoBtn"))
        check("opening an invoice does not move it up the most-recently-changed list",
              "INV-PDF-1" in rows.first.text_content())
        page.click("[data-tab=invoice]")
        page.fill("#invoiceNumber", "INV-PDF-1"); page.wait_for_timeout(100)
        check("duplicate invoice number is flagged", page.is_visible("#invoiceNumberWarning"))
        page.fill("#invoiceNumber", "INV-PDF"); page.wait_for_timeout(100)
        check("warning clears for a unique number", not page.is_visible("#invoiceNumberWarning"))
        page.click("[data-tab=invoices]")
        page.click("#duplicateInvoiceBtn"); page.wait_for_timeout(300)
        check("Duplicate copies the invoice with the next unused number",
              page.input_value("#invoiceNumber") == "INV-PDF-2" and page.text_content("#pSubtotal") == "£25.00"
              and rows.count() == 3, page.input_value("#invoiceNumber"))
        page.fill("#invoiceSearch", "pdf-2"); page.wait_for_timeout(100)
        check("search filters the list", rows.count() == 1)
        page.fill("#invoiceSearch", "")
        page.locator("#invoiceList .invoice-row", has_text="INV-PDF-1").locator("button", has_text="Delete").click()
        confirm_dialog()
        check("delete a saved invoice (with confirmation)", rows.count() == 2)

        # ---- client address book
        page.click("[data-tab=invoice]")
        page.fill("#clientName", "Acme Learning Ltd"); page.fill("#clientAddress", "1 High Street\nLondon")
        page.fill("#clientEmail", "accounts@acme.example")
        page.click("#saveClientBtn"); page.wait_for_timeout(100)
        check("save a client", "Acme Learning Ltd" in page.text_content("#savedClients"))
        page.click("#resetBtn"); page.wait_for_timeout(300)
        page.click("[data-tab=invoice]")
        page.select_option("#savedClients", label="Acme Learning Ltd"); page.wait_for_timeout(100)
        check("pick a saved client fills the Bill to fields",
              page.input_value("#clientAddress") == "1 High Street\nLondon" and "Acme Learning Ltd" in page.text_content("#pClientName"))

        # ---- full backup and restore
        check("backup reminder shows when there is no backup", page.is_visible("#backupReminder"))
        page.click("[data-tab=invoices]")
        with page.expect_download() as dl:
            page.click("#backupBtn")
        backup_path = os.path.join(FIX, dl.value.suggested_filename)
        dl.value.save_as(backup_path)
        backup = json.load(open(backup_path))
        n_saved = rows.count()
        check("backup file holds every invoice, client, template and brand",
              backup["format"] == "sa-invoice-generator-backup" and len(backup["invoices"]) == n_saved
              and len(backup["clients"]) == 1 and len(backup["templates"]) == 1 and len(backup["brands"]) == 1
              and len(backup["logos"]) <= 1, f"{len(backup['invoices'])} vs {n_saved}")
        check("backup reminder clears after a backup", not page.is_visible("#backupReminder"))

        ctx4 = browser.new_context(viewport={"width": 1400, "height": 900})
        ctx4.on("request", on_request)
        p4 = ctx4.new_page()
        p4.on("pageerror", lambda e: errors.append("pageerror(restore): " + str(e)))
        p4.goto(URL); p4.wait_for_timeout(300)
        p4.click("[data-tab=invoices]")
        p4.set_input_files("#restoreFile", backup_path)
        p4.wait_for_selector("#appConfirmDialog[open]"); p4.click("#appConfirmAccept"); p4.wait_for_timeout(300)
        check("restore adds every invoice, client, template and brand on another device",
              p4.locator("#invoiceList .invoice-row").count() == n_saved
              and "Acme Learning Ltd" in p4.text_content("#savedClients")
              and p4.locator("#savedTemplates .library-item").count() == 1
              and p4.locator("#savedBrands .library-item").count() == 1, p4.text_content("#toast"))
        p4.locator("#invoiceList .invoice-row", has_text="INV-PDF-2").locator("button", has_text="Open").click()
        p4.wait_for_timeout(200)
        check("a restored invoice opens with its items and totals", p4.text_content("#pSubtotal") == "£25.00")
        p4.set_input_files("#restoreFile", backup_path)
        p4.wait_for_selector("#appConfirmDialog[open]"); p4.click("#appConfirmAccept"); p4.wait_for_timeout(300)
        check("restoring the same backup again adds nothing",
              p4.locator("#invoiceList .invoice-row").count() == n_saved and "Nothing new" in p4.text_content("#toast"))
        ctx4.close()

        # ---- library deletion
        page.click("[data-tab=design]")
        page.locator("#savedTemplates .library-item button", has_text="Delete").click(); confirm_dialog()
        page.locator("#savedBrands .library-item button", has_text="Remove").click(); confirm_dialog()
        check("delete template and brand",
              page.locator("#savedTemplates .library-item").count() == 0
              and page.locator("#savedBrands .library-item").count() == 0)

        # ---- responsive layouts
        for w, h in [(390, 844), (768, 1024), (1280, 800), (1920, 1080)]:
            page.set_viewport_size({"width": w, "height": h})
            page.wait_for_timeout(150)
            sw = page.evaluate("() => document.documentElement.scrollWidth")
            check(f"no page-level horizontal overflow at {w}px", sw <= w, f"scrollWidth={sw}")
            page.screenshot(path=os.path.join(OUT, OUT_PREFIX + f"viewport-{w}.png"))

        # ---- invoice numbering, typing flush, large logos
        page.set_viewport_size({"width": 1400, "height": 900})
        page.click("[data-tab=invoice]")
        page.fill("#invoiceNumber", "JF2026-09")
        page.click("#nextNumberBtn")
        check("Next number button increments with padding", page.input_value("#invoiceNumber") == "JF2026-10")
        page.fill("#reference", "typed just before reload")
        page.reload(); page.wait_for_timeout(400)
        check("typing saved just before a reload is not lost", page.input_value("#reference") == "typed just before reload")
        page.click("[data-tab=invoice]")
        page.set_input_files("#logoFile", BIG_LOGO); page.wait_for_timeout(1500)
        dims = page.evaluate("""() => new Promise(r => { const i = new Image();
            i.onload = () => r([i.naturalWidth, i.naturalHeight, window.SAInvoiceGenerator.state.logo.length]); i.src = window.SAInvoiceGenerator.state.logo; })""")
        check("large logo is scaled to at most 1200 px and stored smaller",
              max(dims[0], dims[1]) == 1200 and dims[2] < os.path.getsize(BIG_LOGO) * 4 / 3, str(dims))
        page.click("#removeLogoBtn")

        # ---- two tabs editing the same invoice
        tab_a, tab_b = page, ctx.new_page()
        tab_b.on("pageerror", lambda e: errors.append("pageerror(tab b): " + str(e)))
        tab_b.goto(URL); tab_b.wait_for_timeout(400)
        tab_a.fill("#invoiceNumber", "FROM-TAB-A"); tab_a.wait_for_timeout(600)
        tab_b.wait_for_selector("#appConfirmDialog[open]", timeout=3000)
        check("the other tab is asked which version to keep", "another tab" in tab_b.text_content("#appConfirmMessage"))
        tab_b.click("#appConfirmAccept"); tab_b.wait_for_timeout(200)
        check("loading the other tab's version", tab_b.input_value("#invoiceNumber") == "FROM-TAB-A")
        tab_b.fill("#invoiceNumber", "FROM-TAB-B"); tab_b.wait_for_timeout(600)
        tab_a.wait_for_selector("#appConfirmDialog[open]", timeout=3000)
        tab_a.click("#appConfirmCancel"); tab_a.wait_for_timeout(200)
        stored = tab_a.evaluate("() => JSON.parse(localStorage.getItem('invoiceStudioPro.v2')).fields.invoiceNumber")
        check("keeping this tab's version saves it over the other", stored == "FROM-TAB-A")
        tab_b.wait_for_selector("#appConfirmDialog[open]", timeout=3000)
        tab_b.click("#appConfirmAccept"); tab_b.wait_for_timeout(200)
        tab_b.close()

        # ---- 2.4.0 interface details
        page.set_viewport_size({"width": 1400, "height": 900}); page.wait_for_timeout(150)
        page.click("[data-tab=design]")
        page.select_option("#template", "minimal")
        check("template menu uses plain names with a description",
              page.locator("#template option:checked").text_content() == "Janets Fanatical"
              and "Janets" in page.text_content("#fontHint"))
        page.select_option("#template", "modern")
        page.select_option("#logoFallback", "none"); page.wait_for_timeout(100)
        check("no-logo option hides the logo box when there is no logo",
              "section-hidden" in page.get_attribute('#invoice [data-section="logo"]', "class"))
        page.select_option("#logoFallback", "initial"); page.wait_for_timeout(100)
        check("company initial shows again", "section-hidden" not in page.get_attribute('#invoice [data-section="logo"]', "class"))
        page.set_viewport_size({"width": 700, "height": 900}); page.wait_for_timeout(150)
        page.click("#zoomFit"); page.wait_for_timeout(150)
        stage_w = page.evaluate("() => document.getElementById('invoiceStage').getBoundingClientRect().width")
        ws_w = page.evaluate("() => document.querySelector('.workspace').clientWidth")
        check("Fit makes the whole page width fit the preview area", stage_w <= ws_w and stage_w > ws_w * 0.8, f"{stage_w} in {ws_w}")
        page.click("#zoomIn"); page.set_viewport_size({"width": 1400, "height": 900}); page.wait_for_timeout(150)
        page.click("#privacyNoticeClose")
        page.reload(); page.wait_for_timeout(400)
        check("privacy note stays hidden once dismissed", page.is_hidden("#privacyNotice"))
        page.evaluate("() => localStorage.removeItem('invoiceStudio.lastBackupAt')"); page.reload(); page.wait_for_timeout(400)
        page.click("#backupLaterBtn"); page.reload(); page.wait_for_timeout(400)
        check("backup reminder Later snoozes it", page.is_hidden("#backupReminder"))
        page.click("[data-tab=invoice]")
        page.set_input_files("#sheetFile", BROKEN); page.wait_for_timeout(600)
        check("errors stay on screen with a dismiss button",
              "error" in page.get_attribute("#toast", "class") and page.is_visible("#toast .toast-close"))
        page.wait_for_timeout(2600)
        still = "show" in page.get_attribute("#toast", "class")
        page.click("#toast .toast-close")
        check("error is still shown after the normal fade time, and dismisses", still and "show" not in page.get_attribute("#toast", "class"))
        page.click("[data-tab=invoice]")
        page.click("#reference"); page.keyboard.press("Control+z"); page.wait_for_timeout(100)
        check("first Ctrl+Z in a text field explains what undo does", "Ctrl+Z undoes your last change" in page.text_content("#toast"))
        page.keyboard.press("Control+y")

        mob = browser.new_context(viewport={"width": 390, "height": 844})
        mob.on("request", on_request)
        pm = mob.new_page(); pm.goto(URL); pm.wait_for_timeout(500)
        check("phone: page fits the screen without sideways scrolling",
              pm.evaluate("() => document.documentElement.scrollWidth") <= 390
              and pm.evaluate("() => document.getElementById('invoiceStage').getBoundingClientRect().right") <= 390)
        overflow = pm.evaluate("""() => [...document.querySelectorAll('.sidebar input:not([type=file]):not([type=checkbox]), .sidebar select, .sidebar textarea, .sidebar .btn')]
            .filter(e => e.offsetParent).filter(e => { const p = e.closest('.panel') || e.closest('.sidebar');
              return e.getBoundingClientRect().right > p.getBoundingClientRect().right + 0.5; }).map(e => e.id || e.className)""")
        check("phone: no field or button sticks out of its panel", not overflow, str(overflow))
        check("phone: Preview button is shown", pm.is_visible("#jumpBtn") and "Preview" in pm.text_content("#jumpBtn"))
        pm.click("#jumpBtn"); pm.wait_for_timeout(900)
        check("phone: Preview button scrolls to the invoice, then offers Edit", "Edit" in pm.text_content("#jumpBtn"))
        pm.screenshot(path=os.path.join(OUT, OUT_PREFIX + "phone-preview.png"))
        mob.close()

        # ---- watermark (Modern template, per brand)
        cw = browser.new_context(viewport={"width": 1400, "height": 900}, accept_downloads=True)
        cw.on("request", on_request)
        pw = cw.new_page(); pw.on("pageerror", lambda e: errors.append("pageerror(watermark): " + str(e)))
        pw.on("dialog", lambda d: (native_popups.append(d.type), d.accept()))
        pw.goto(URL); pw.wait_for_timeout(400)
        pw.evaluate("() => document.querySelectorAll('details.panel').forEach(d => d.open = true)")
        pw.fill("#companyName", "Brand A Ltd"); pw.fill("#companyAddress", "London"); pw.fill("#clientName", "Acme"); pw.fill("#clientAddress", "Leeds")
        pw.click("#addItemBtn"); pw.locator(".itemrow").last.locator('[data-key="rate"]').fill("100")
        pw.click("#tabbtn-design")
        check("watermark is off by default and its settings are hidden",
              pw.is_hidden("#pWatermark") and pw.is_hidden("#watermarkText") and pw.text_content("#sumWatermark") == "Off")
        pw.select_option("#watermarkType", "text"); pw.fill("#watermarkText", "PAID"); pw.wait_for_timeout(200)
        check("text watermark renders behind the Modern invoice",
              pw.is_visible("#pWatermark") and pw.text_content("#pWatermark text") == "PAID"
              and pw.evaluate("() => getComputedStyle(document.getElementById('pWatermark')).zIndex") == "-1")
        pw.locator("#watermarkOpacity").fill("20"); pw.wait_for_timeout(150)
        check("opacity slider applies and is labelled",
              pw.get_attribute("#pWatermark g", "opacity") == "0.2" and pw.text_content("#watermarkOpacityValue") == "20%")
        for i in range(25):
            pw.click("#tabbtn-invoice"); pw.click("#addItemBtn")
        pw.wait_for_timeout(400); pw.click("#tabbtn-design")
        check("centred layout puts one watermark on each printed page",
              pw.locator("#pWatermark text").count() >= 2)
        pw.select_option("#watermarkLayout", "tiled"); pw.wait_for_timeout(150)
        check("tiled layout repeats the watermark", pw.locator("#pWatermark pattern").count() == 1)
        pw.select_option("#watermarkLayout", "centred")
        pw.select_option("#template", "minimal"); pw.wait_for_timeout(150)
        check("other templates do not show it, and the panel says why",
              pw.is_hidden("#pWatermark") and pw.is_visible("#watermarkTemplateHint") and "(not on this template)" in pw.text_content("#sumWatermark"))
        pw.select_option("#template", "modern")
        pw.select_option("#watermarkType", "image")
        pw.set_input_files("#watermarkFile", LOGO); pw.wait_for_timeout(500)
        check("uploaded watermark image renders, with a Remove button",
              (pw.get_attribute("#pWatermark image", "href") or "").startswith("data:image/png") and pw.is_visible("#removeWatermarkBtn"))
        pw.select_option("#watermarkType", "text"); pw.fill("#watermarkText", "BRAND A")
        pw.fill("#accentHex", "#c2185b"); pw.wait_for_timeout(200)
        pw.click("#saveBrandBtn"); pw.wait_for_selector("#appPromptDialog[open]"); pw.fill("#appPromptInput", "Brand A"); pw.click("#appPromptAccept"); pw.wait_for_timeout(150)
        pw.fill("#watermarkText", "BRAND B"); pw.fill("#accentHex", "#1565c0"); pw.wait_for_timeout(150)
        pw.click("#saveBrandBtn"); pw.wait_for_selector("#appPromptDialog[open]"); pw.fill("#appPromptInput", "Brand B"); pw.click("#appPromptAccept"); pw.wait_for_timeout(150)
        pw.locator("#savedBrands .library-item", has_text="Brand A").locator("button", has_text="Load").click(); pw.wait_for_timeout(200)
        check("each brand keeps its own watermark (multi-brand)",
              pw.text_content("#pWatermark text") == "BRAND A" and pw.get_attribute("#pWatermark text", "fill") == "#c2185b")
        pw.reload(); pw.wait_for_timeout(500)
        check("watermark survives a reload", pw.text_content("#pWatermark text") == "BRAND A")
        pw.click("#moreBtn"); pw.click("#printBtn")
        doc_html, frame_info = None, None
        for _ in range(80):
            if pw.evaluate("() => document.getElementById('appConfirmDialog').open"):
                pw.click("#appConfirmAccept")
            frame_info = pw.evaluate("""() => { const f = document.getElementById('invoicePrintFrame'); const d = f && f.contentDocument;
                if (!d || !d.querySelector('.invoice')) return null;
                return { html: d.documentElement.outerHTML, accent: getComputedStyle(d.documentElement).getPropertyValue('--accent').trim() }; }""")
            if frame_info: break
            pw.wait_for_timeout(25)
        check("printout keeps the invoice accent colour (was always the default blue)",
              frame_info and frame_info["accent"] == "#c2185b", str(frame_info and frame_info["accent"]))
        wpdf = cw.new_page(); wpdf.goto(URL)
        wpdf.evaluate("h => { document.open(); document.write(h); document.close(); }", frame_info["html"]); wpdf.wait_for_timeout(500)
        wpdf_path = os.path.join(OUT, OUT_PREFIX + "watermark.pdf")
        wpdf.pdf(path=wpdf_path, prefer_css_page_size=True, print_background=False)
        # Text stretched to an exact width is not extractable as text, so the
        # PDF is rendered to an image and checked for watermark-coloured pixels
        # (#c2185b at 20% over white is about (243, 209, 222)).
        try:
            from PIL import Image
            subprocess.run(["pdftoppm", "-png", "-r", "40", "-f", "1", "-l", "1", wpdf_path, os.path.join(FIX, "wm")], check=True)
            img = Image.open(os.path.join(FIX, "wm-1.png")).convert("RGB")
            hits = sum(1 for px in img.getdata() if abs(px[0] - 243) < 14 and abs(px[1] - 209) < 14 and abs(px[2] - 222) < 14)
            check("watermark prints in the PDF even with background graphics off", hits > 300, f"{hits} pixels")
        except (FileNotFoundError, ImportError):
            pass
        pw.click("#tabbtn-design"); pw.fill("#watermarkText", ""); pw.click("#pdfBtn")
        pw.wait_for_selector("#appConfirmDialog[open]")
        check("export check flags a watermark with no text", "watermark is on but has no text" in pw.text_content("#appConfirmList"))
        pw.click("#appConfirmCancel")
        cw.close()

        # ---- UKHF Fanatical template (matches the supplied FNT 2026 invoice)
        cu = browser.new_context(viewport={"width": 1400, "height": 900})
        cu.on("request", on_request)
        pu = cu.new_page(); pu.on("pageerror", lambda e: errors.append("pageerror(ukhf): " + str(e)))
        pu.goto(URL); pu.wait_for_timeout(400)
        pu.evaluate("() => document.querySelectorAll('details.panel').forEach(d => d.open = true)")
        for sel, val in [("#invoiceNumber", "2026-3080"), ("#invoiceDate", "2026-10-13"), ("#companyName", "Mayfair College Ltd"),
                         ("#companyReg", "12389626"), ("#companyAddress", "163 City Road, London, England, EC1V 1NR"),
                         ("#clientName", "Fanatical\nFocus Multimedia Ltd"), ("#clientAddress", "The Studios, Lea Hall Enterprise Park\nWheelhouse Road, Rugeley"),
                         ("#paymentDetails", "PayPal Details: info@hfonline.org\nNatWest A/C | MAYFAIR COLLEGE LTD\nSort Code: 600537\nIBAN | GB29NWBK60053724214205")]:
            pu.fill(sel, val)
        for d, q, r in [("New Skills New You Build Your Own eLearning Bundle", "354", "0.2331"), ("Total Tech & Cybersecurity Masterclass Bundle", "300", "0.206")]:
            pu.click("#addItemBtn"); row = pu.locator(".itemrow").last
            row.locator('[data-key="description"]').fill(d); row.locator('[data-key="quantity"]').fill(q); row.locator('[data-key="rate"]').fill(r)
        pu.set_input_files("#logoFile", LOGO); pu.wait_for_timeout(300)
        pu.click("#tabbtn-design"); pu.select_option("#template", "ukhf"); pu.wait_for_timeout(300)
        check("UKHF Fanatical is in the template list", pu.locator('#template option[value="ukhf"]').text_content() == "UKHF Fanatical")
        check("template names: Alpha Academy, One Education and Janets Fanatical, plus Multipurpose",
              pu.eval_on_selector_all("#template option", "o => o.map(x => x.textContent)")
              == ["Modern", "Janets Fanatical", "One Education Fanatical", "Alpha Academy Fanatical", "UKHF Fanatical", "Multipurpose"])
        check("UKHF header: INVOICE, Date: 13-Oct-2026, INVOICE #2026-3080",
              pu.text_content("#pInvoiceTitle") == "INVOICE" and pu.text_content("#pDate") == "13-Oct-2026"
              and pu.text_content("#pInvoiceNo") == "INVOICE #2026-3080" and pu.is_hidden('#invoice tr[data-section="dueDate"]'))
        check("'Invoice for' line defaults to the month before the invoice date", pu.text_content("#pPeriodTitle") == "Invoice for September 2026")
        check("company block: bold name, Reg.no and one-line Address",
              pu.text_content("#pCompanyMeta") == "Reg.no: 12389626\nAddress: 163 City Road, London, England, EC1V 1NR")
        check("client: only the first line is bold, the rest prints with the address",
              pu.text_content("#pClientName") == "Fanatical" and pu.text_content("#pClientMeta").startswith("Focus Multimedia Ltd\nThe Studios"))
        heads = pu.eval_on_selector_all("#pHeaders th", "t => t.map(x => x.textContent)")
        check("bundle table columns: Bundle Name, Net Qty, Royalty", heads == ["Bundle Name", "Net Qty", "Royalty"], str(heads))
        total_row = pu.eval_on_selector_all("#pClassicTotals td", "t => t.map(x => x.textContent)")
        check("table ends with 'Total =', the quantity total and the royalty total", total_row == ["Total =", "654", "£144.32"], str(total_row))
        check("PayPal line, then Bank Details as a boxed table (colons as typed)",
              "PayPal Details:" in pu.text_content("#pPayment .ukhf-pay-line strong")
              and pu.eval_on_selector_all("#pPayment .ukhf-bank td:first-child", "t => t.map(x => x.textContent)") == ["NatWest A/C", "Sort Code:", "IBAN"])
        check("closing line: Thank you for your Partnership!", pu.text_content("#pFooterCompany") == "Thank you for your Partnership!")
        check("choosing the template switches on the logo watermark and logo size (untouched settings only)",
              pu.input_value("#watermarkType") == "logo" and pu.input_value("#logoWidth") == "168" and pu.is_visible("#pWatermark"))
        pu.click("#tabbtn-invoice"); pu.fill("#reference", "Q3 2026"); pu.fill("#terms", "With thanks"); pu.wait_for_timeout(150)
        check("Reference and Terms override the 'Invoice for' line and the closing line",
              pu.text_content("#pPeriodTitle") == "Invoice for Q3 2026" and pu.text_content("#pFooterCompany") == "With thanks")
        pu.click("#tabbtn-design"); pu.select_option("#template", "modern"); pu.select_option("#watermarkType", "text"); pu.fill("#watermarkText", "MINE")
        pu.select_option("#template", "ukhf"); pu.wait_for_timeout(200)
        check("re-choosing the template keeps a watermark you set yourself", pu.input_value("#watermarkType") == "text")
        check("UKHF Fanatical previews on US Letter, like the original",
              pu.text_content("#previewMeta") == "US Letter portrait preview"
              and abs(pu.evaluate("() => document.getElementById('invoice').offsetWidth") - 816) <= 1)
        pu.click("#tabbtn-invoice")
        pu.fill("#notes", "You can use the following bank details for payment.")
        pu.fill("#paymentDetails", "Account Name Edukators London Ltd\nAccount Number 60992068\nSort Code 309897\nIBAN GB62LOYD30989760992068\nPaypal info@oneeducation.org.uk")
        pu.wait_for_timeout(150)
        check("bank labels are recognised without colons (Account Name, Sort Code, IBAN, Paypal)",
              pu.eval_on_selector_all("#pPayment .ukhf-bank td:first-child", "t => t.map(x => x.textContent)") == ["Account Name", "Account Number", "Sort Code", "IBAN"]
              and pu.text_content("#pPayment .ukhf-pay-line") == "PayPal Details: info@oneeducation.org.uk")
        check("long bank labels are not cut off",
              pu.evaluate("() => { const c=document.querySelectorAll('#pPayment .ukhf-bank td')[2]; return c.scrollWidth <= c.clientWidth + 1; }"))
        check("notes print as plain text, not in a shaded box",
              pu.evaluate("() => { const n=document.querySelector('#invoice .notebox'); const s=getComputedStyle(n); return s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.borderTopWidth === '0px'; }"))
        pu.click("#moreBtn"); pu.click("#printBtn")
        uhtml = None
        for _ in range(80):
            if pu.evaluate("() => document.getElementById('appConfirmDialog').open"):
                pu.click("#appConfirmAccept")
            uhtml = pu.evaluate("() => { const f=document.getElementById('invoicePrintFrame'); const d=f&&f.contentDocument; return d&&d.querySelector('.invoice') ? d.documentElement.outerHTML : null }")
            if uhtml: break
            pu.wait_for_timeout(25)
        check("print message says which paper to choose", "US Letter" in pu.text_content("#toast"))
        upage = cu.new_page(); upage.set_content(uhtml, wait_until="load"); upage.wait_for_timeout(300)
        upath = os.path.join(OUT, OUT_PREFIX + "ukhf.pdf"); upage.pdf(path=upath, prefer_css_page_size=True)
        try:
            size = subprocess.run(["pdfinfo", upath], capture_output=True, text=True).stdout
            check("UKHF Fanatical prints on US Letter (612 x 792 pt)", "612 x 792" in size, size[-120:])
        except FileNotFoundError:
            pass
        cu.close()

        # ---- Modern fixes and the Multipurpose template
        cm = browser.new_context(viewport={"width": 1400, "height": 900})
        cm.on("request", on_request)
        pmo = cm.new_page(); pmo.on("pageerror", lambda e: errors.append("pageerror(modern): " + str(e)))
        pmo.goto(URL); pmo.wait_for_timeout(400)
        pmo.evaluate("() => document.querySelectorAll('details.panel').forEach(d => d.open = true)")
        pmo.fill("#companyName", "Staff Asia Ltd"); pmo.fill("#companyEmail", "accounts@staffasia.org"); pmo.fill("#notes", "Short note.")
        pmo.click("#addItemBtn"); r0 = pmo.locator(".itemrow").last
        r0.locator('[data-key="quantity"]').fill("354"); r0.locator('[data-key="rate"]').fill("0.2331"); pmo.wait_for_timeout(150)
        cells = pmo.eval_on_selector_all("#pItems tr td", "t => t.map(x => x.textContent)")
        check("rates print with the precision they need (0.2331, not 0.23)", "£0.2331" in cells and "£82.52" in cells, str(cells))
        check("placeholder logo is a square",
              pmo.evaluate("() => { const b=document.querySelector('#invoice .logobox'); return b.offsetWidth === b.offsetHeight; }"))
        check("Modern notes box fits its text (no fixed 88px block)",
              pmo.evaluate("() => getComputedStyle(document.querySelector('#invoice .notebox')).minHeight") == "0px")
        def print_css(page):
            page.click("#moreBtn"); page.click("#printBtn")
            for _ in range(80):
                if page.evaluate("() => document.getElementById('appConfirmDialog').open"):
                    page.click("#appConfirmAccept")
                css = page.evaluate("() => { const f=document.getElementById('invoicePrintFrame'); const d=f&&f.contentDocument; return d&&d.querySelector('.invoice') ? [...d.querySelectorAll('style')].map(x=>x.textContent).join('') : null }")
                if css: return css
                page.wait_for_timeout(25)
            return ""
        check("Modern prints with a 12mm bottom margin on every page", "margin: 12mm 0 12mm 0" in print_css(pmo))
        pmo.click("#tabbtn-design"); pmo.select_option("#template", "multipurpose"); pmo.wait_for_timeout(200)
        check("Multipurpose renders with the accent header row and its footer line",
              pmo.evaluate("() => getComputedStyle(document.querySelector('#pHeaders th')).backgroundColor") == "rgb(70, 183, 81)"
              and "Staff Asia Ltd" in pmo.text_content("#pFooterCompany") and "accounts@staffasia.org" in pmo.text_content("#pFooterCompany")
              and pmo.text_content("#pBalanceLabel") == "Amount due")
        pmo.select_option("#watermarkType", "text"); pmo.fill("#watermarkText", "DRAFT"); pmo.wait_for_timeout(150)
        check("Multipurpose shows watermarks", pmo.is_visible("#pWatermark") and pmo.text_content("#pWatermark text") == "DRAFT")
        check("Multipurpose prints on A4 with the bottom margin", "size: 210mm 297mm" in print_css(pmo))
        cm.close()

        # ---- storage failure handling (separate profile)
        ctx3 = browser.new_context(timezone_id="Asia/Dhaka")
        ctx3.on("request", on_request)
        p3 = ctx3.new_page()
        p3.goto(URL); p3.wait_for_timeout(300)
        d1, d2 = p3.input_value("#invoiceDate"), p3.input_value("#dueDate")
        check("due date is +14 days east of UTC (was 13)",
              p3.evaluate("([a, b]) => (new Date(b) - new Date(a)) / 864e5", [d1, d2]) == 14)
        p3.evaluate("() => localStorage.setItem('invoiceStudioPro.v2', '{corrupt')")
        p3.reload(); p3.wait_for_timeout(300)
        p3.fill("#reference", "after corruption"); p3.wait_for_timeout(100)
        check("unreadable autosave is kept as a backup, not overwritten",
              p3.evaluate("() => localStorage.getItem('invoiceStudioPro.v2.unreadableBackup')") == "{corrupt")
        p3.evaluate("() => { Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); }; }")
        p3.fill("#reference", "storage full"); p3.wait_for_timeout(600)
        check("failed autosave is reported to the user", "Autosave failed" in p3.text_content("#toast"))
        ctx3.close()

        check("no browser popups (all questions use the app's dialogs)", not native_popups, str(native_popups))
        check("no console or page errors", not errors, "; ".join(errors[:5]))
        check("no requests left 127.0.0.1", not external, ", ".join(external[:5]))
        browser.close()
finally:
    if server:
        server.terminate()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
sys.exit(1 if failed else 0)
