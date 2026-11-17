"""
The 2.14.0 way of working, in headless Chromium against the local server:

    python3 tests/e2e_ux.py

New invoice opens "Who is this invoice from?"; an academy's first invoice
fills in its details; its next one continues from the last (next number,
same payment term, Q3 moved on to Q4); each academy keeps its own numbers.
Lines can be pasted from Excel, and Alison designs with only Description and
Amount get just those boxes. Clicking the preview goes to the field. Check
and export flags a line that repeats the total, names the PDF and marks the
invoice as issued. The invoices board shows each academy's status for a
quarter (overdue worked out from the due date) and marks invoices as paid.
"""

import os, re, subprocess, sys, time, datetime
from playwright.sync_api import sync_playwright
from unlock_helper import prepare_browser, raw_context, TEST_PASSWORD, test_single_file

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "tests", "output")
os.makedirs(OUT, exist_ok=True)
PORT = int(os.environ.get("E2E_PORT", "8785"))
URL = f"http://127.0.0.1:{PORT}/index.html"
results = []


def check(name, ok, detail=""):
    results.append(bool(ok))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))


server = subprocess.Popen([sys.executable, os.path.join(ROOT, "serve.py"), str(PORT), "--no-browser"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
errors = []
try:
    with sync_playwright() as p:
        browser = prepare_browser(p.chromium.launch())
        ctx = browser.new_context(viewport={"width": 1440, "height": 900}, timezone_id="Europe/London")
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(URL)
        page.wait_for_timeout(500)

        index = lambda: page.evaluate("() => JSON.parse(localStorage.getItem('invoiceStudio.invoiceIndex.v1') || '[]')")
        today = page.evaluate("() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }")
        quarter = page.evaluate("""t => { const [y, m] = t.split('-').map(Number); const q = Math.ceil(m / 3);
            return q === 1 ? 'Q4-' + (y - 1) : 'Q' + (q - 1) + '-' + y; }""", today)

        # ---- the master password
        lc = raw_context(browser, viewport={"width": 1440, "height": 900})
        lp = lc.new_page()
        lp.on("pageerror", lambda e: errors.append("lock: " + str(e)))
        lp.goto(URL)
        lp.wait_for_timeout(600)
        check("the app opens on the lock screen, with nothing else shown",
              lp.is_visible("#lockScreen") and lp.is_hidden("#appBar") and lp.is_hidden("#view-editor")
              and lp.evaluate("() => !document.querySelector('#itemsEditor .itemrow') && document.getElementById('invoiceNumber').value === 'INV-1001'"))
        lp.fill("#lockPassword", "not-the-password")
        lp.click("#lockSubmit")
        lp.wait_for_selector("#lockError:not([hidden])")
        check("a wrong password is refused", "not right" in lp.text_content("#lockError") and lp.is_hidden("#appBar"))
        lp.fill("#lockPassword", TEST_PASSWORD)
        lp.click("#lockSubmit")
        lp.wait_for_selector("#appBar", state="visible")
        check("the right password opens the app", lp.is_hidden("#lockScreen"))
        lp.click("#resetBtn"); lp.wait_for_selector("#pickerDialog[open]")
        lp.locator('.academy-tile[data-academy="alison-janets"]').first.click(); lp.wait_for_timeout(900)
        check("the academy's details come from the encrypted vault", lp.input_value("#companyName") == "Edujanets Ltd."
              and "IBAN" in lp.input_value("#paymentDetails"))
        lp.reload(); lp.wait_for_timeout(900)
        check("the device remembers the password (no lock screen after a reload)", lp.is_visible("#appBar") and lp.is_hidden("#lockScreen"))
        lp.click("#accountBtn"); lp.wait_for_timeout(300)
        check("Settings says until when this device remembers it", "remembers the master password until" in lp.text_content("#lockStatus"))
        lp.click("#lockNowBtn"); lp.wait_for_timeout(900)
        check("Lock now shows the lock screen again", lp.is_visible("#lockScreen") and lp.is_hidden("#appBar"))
        lp.uncheck("#lockRemember")
        lp.fill("#lockPassword", TEST_PASSWORD); lp.click("#lockSubmit")
        lp.wait_for_selector("#appBar", state="visible")
        lp.reload(); lp.wait_for_timeout(900)
        check("without Remember, the password is asked again after a reload", lp.is_visible("#lockScreen"))
        lc.close()

        # ---- the academy picker
        page.click("#resetBtn")
        page.wait_for_selector("#pickerDialog[open]")
        check("New invoice asks who the invoice is from", page.text_content("#pickerTitle") == "Who is this invoice from?")
        groups = page.eval_on_selector_all(".picker-group h3", "h => h.map(x => x.textContent)")
        check("academies are grouped Alison, Fanatical, General", groups == ["Alison", "Fanatical", "General"], str(groups))
        check("every academy has a tile (18 Alison, 4 Fanatical, 2 General)", page.locator(".academy-tile").count() == 24)
        page.wait_for_timeout(400)
        check("Alison academies show their logo", page.locator('.academy-tile[data-academy="alison-janets"] img').count() == 1)
        page.fill("#pickerSearch", "janets")
        check("search narrows the tiles", page.locator(".academy-tile").count() == 2, str(page.locator(".academy-tile").count()))
        page.locator('.academy-tile[data-academy="alison-janets"]').click()
        page.wait_for_timeout(1000)
        check("an academy's first invoice starts in its template with its details, Alison as client, as a draft",
              page.input_value("#template") == "alison-janets" and page.input_value("#companyName").startswith("Edujanets")
              and page.input_value("#clientName").startswith("Alison") and page.input_value("#currency") == "EUR"
              and page.input_value("#invoiceStatus") == "draft")
        check("the top bar shows the academy and the invoice", "Janets Alison" in page.text_content("#academyName")
              and page.text_content("#statusBtnText") == "Draft")

        # ---- Alison designs with Description and Amount: just those boxes
        heads = page.eval_on_selector_all("#itemsHead span", "s => s.map(x => x.textContent).filter(Boolean)")
        check("Janets Alison lines have just Description and Amount", heads == ["Description", "Amount"], str(heads))

        # ---- paste from Excel
        page.click("#pasteItemsBtn")
        page.fill("#pasteArea", "Description\tAmount\nOpening balance\t2,254.64\nQ3-2026 earnings\t1,993.71\nClosing balance\t4,248.35")
        page.click("#pasteAddBtn")
        page.wait_for_timeout(300)
        amounts = [page.locator(".itemrow").nth(i).locator('[data-key="$amount"]').input_value() for i in range(3)]
        check("pasted rows become lines with their amounts", page.locator(".itemrow").count() == 3
              and amounts == ["2254.64", "1993.71", "4248.35"], str(amounts))
        check("the pinned total follows", page.text_content("#pinnedTotalValue") == "€8,496.70")
        page.locator(".itemrow").first.locator("textarea").evaluate("""el => { const dt = new DataTransfer();
            dt.setData('text/plain', 'Bonus\\t10\\nAdjustment\\t-10');
            el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }""")
        page.wait_for_timeout(200)
        check("pasting cells into a description adds them as lines after it", page.locator(".itemrow").count() == 5
              and page.locator(".itemrow").nth(1).locator("textarea").input_value() == "Bonus")
        page.locator(".itemrow").nth(2).locator(".remove").click()
        page.locator(".itemrow").nth(1).locator(".remove").click()
        page.locator(".itemrow").nth(1).locator('[data-key="$amount"]').fill("1993.71")
        page.fill("#invoiceNumber", "2026-11005")
        page.fill("#invoiceDate", "2026-11-05")
        page.fill("#dueDate", "2026-11-20")
        page.wait_for_timeout(500)

        # ---- click the preview to edit
        page.locator("#pCustom").get_by_text("Mount Carmel", exact=False).first.click()
        page.wait_for_timeout(300)
        check("clicking the client's address on the invoice goes to that field",
              page.evaluate("() => document.activeElement.id") == "clientAddress")
        page.locator("#pCustom").get_by_text("Q3-2026 earnings").first.click()
        page.wait_for_timeout(300)
        check("clicking a line on the invoice goes to that line",
              page.evaluate("() => document.activeElement.id") == "item-1-field-0")

        # ---- Check and export
        page.click("#pdfBtn")
        page.wait_for_selector("#exportDialog[open]")
        issues = page.text_content("#exportIssues")
        check("Check and export finds the line that repeats the total",
              "Line 3 repeats the total" in issues and "€8,496.70 instead of €4,248.35" in issues, issues)
        check("and lists what is fine", "PayPal and bank details are on the invoice" in page.text_content("#exportPasses")
              and "Issued November 5, 2026, due November 20, 2026 (15 days)" in page.text_content("#exportPasses"), page.text_content("#exportPasses"))
        check("the PDF is named by academy, number and quarter",
              page.input_value("#pdfFileName") == "Janets-Alison_2026-11005_Q3-2026", page.input_value("#pdfFileName"))
        check("Mark as issued is ticked for a draft", page.is_checked("#markIssuedCheck"))
        page.locator("#exportIssues button", has_text="Go to line 3").click()
        page.wait_for_timeout(300)
        check("Go to line 3 closes the dialog and puts the cursor in that line",
              not page.evaluate("() => document.getElementById('exportDialog').open")
              and page.evaluate("() => document.activeElement.id") == "item-2-field-0")
        page.locator(".itemrow").nth(2).locator(".remove").click()
        page.wait_for_timeout(300)
        page.click("#pdfBtn")
        page.wait_for_selector("#exportDialog[open]")
        check("with the line removed there is nothing to fix", page.locator("#exportIssues li").count() == 0
              and page.text_content("#exportGoBtn") == "Export PDF")
        page.evaluate("() => { window.__printed = 0; window.print = () => {}; }")
        page.click("#exportGoBtn")
        title = None
        for _ in range(60):
            title = page.evaluate("() => { const f = document.getElementById('invoicePrintFrame'); return f && f.contentDocument && f.contentDocument.title; }")
            if title: break
            page.wait_for_timeout(50)
        check("the print document carries the file name", title == "Janets-Alison_2026-11005_Q3-2026", str(title))
        page.wait_for_timeout(200)
        check("exporting marks the invoice as issued", page.input_value("#invoiceStatus") == "issued"
              and page.text_content("#statusBtnText") in ("Issued", "Overdue"))

        # ---- Alison Statement Grabber: paste a payout statement, choose the lines
        statement = " Q2-2026 Payout \n\n\n\nOpening Balance: €29,000.00\nQ2-2026 Earnings: €8,200.77\n\n*Less Publishing Costs Recouped: €0.00\nClosing Balance: €37,200.77\n\n\nProposed Payment: €37,200.77\n"
        paste_on_page = "t => { const dt = new DataTransfer(); dt.setData('text/plain', t); document.getElementById('invoiceStage').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }"
        page.evaluate(paste_on_page, statement)
        page.wait_for_timeout(500)
        check("a statement pasted on the page opens the Alison Statement Grabber and asks which lines to add",
              page.evaluate("() => document.getElementById('panel-statement').open") and page.is_visible("#statementResult")
              and page.text_content("#statementAllBtn") == "Add all 3 lines (€37,200.77)"
              and page.text_content("#statementQuarterBtn") == "Add only Q2-2026 Earnings (€8,200.77)")
        check("the grabber checks the lines against the statement's total",
              "matching the statement's Proposed Payment" in page.text_content("#statementCheck")
              and page.locator("#statementRows tr.kind-total").count() == 2)
        page.click("#statementQuarterBtn")
        page.wait_for_selector("#appConfirmDialog[open]")
        page.click("#appConfirmAccept")
        page.wait_for_timeout(300)
        check("Add only the quarter: one line, the quarter set to Q2-2026",
              page.locator(".itemrow").count() == 1 and page.locator(".itemrow textarea").first.input_value() == "Q2-2026 Earnings"
              and page.text_content("#pinnedTotalValue") == "€8,200.77" and page.input_value("#invoicePeriod") == "Q2-2026")
        page.click("#tabbtn-invoice")
        page.locator(".itemrow textarea").first.evaluate("(el, t) => { const dt = new DataTransfer(); dt.setData('text/plain', t); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }", statement)
        page.wait_for_timeout(400)
        page.click("#statementAllBtn")
        page.wait_for_selector("#appConfirmDialog[open]")
        page.click("#appConfirmAccept")
        page.wait_for_timeout(300)
        descs = [page.locator(".itemrow").nth(i).locator("textarea").input_value() for i in range(page.locator(".itemrow").count())]
        check("Add all: opening balance, earnings and the deduction, totalling the proposed payment",
              descs == ["Opening Balance", "Q2-2026 Earnings", "Less Publishing Costs Recouped"]
              and page.text_content("#pinnedTotalValue") == "€37,200.77", str(descs))
        page.keyboard.press("Control+z"); page.wait_for_timeout(200)
        page.keyboard.press("Control+z"); page.wait_for_timeout(200)
        check("Undo brings the earlier lines back", page.locator(".itemrow").count() == 2
              and page.text_content("#pinnedTotalValue") == "€4,248.35", page.text_content("#pinnedTotalValue"))

        # ---- the next quarter continues from the last
        page.click("#resetBtn")
        page.wait_for_selector("#pickerDialog[open]")
        sub = page.locator('.academy-tile[data-academy="alison-janets"]').first.text_content()
        check("the picker says Janets continues from its last invoice, for Q4", "Continues from 2026-11005 (Q3-2026), for Q4-2026" in sub, sub)
        page.locator('.academy-tile[data-academy="alison-janets"]').first.click()
        page.wait_for_timeout(500)
        descs = [page.locator(".itemrow").nth(i).locator("textarea").input_value() for i in range(page.locator(".itemrow").count())]
        due_days = page.evaluate("() => (new Date(document.getElementById('dueDate').value) - new Date(document.getElementById('invoiceDate').value)) / 864e5")
        check("Janets' next invoice: next number, today's date, same 15-day term, Q4 in the lines, a draft",
              page.input_value("#invoiceNumber") == "2026-11006" and page.input_value("#invoiceDate") == today and due_days == 15
              and descs == ["Opening balance", "Q4-2026 earnings"] and page.input_value("#invoicePeriod") == "Q4-2026"
              and page.input_value("#invoiceStatus") == "draft", f"{page.input_value('#invoiceNumber')} {due_days} {descs}")
        page.click("#pdfBtn")
        page.wait_for_selector("#exportDialog[open]")
        check("unchanged amounts from last quarter are flagged", "amounts are the same as on the Q3-2026 invoice" in page.text_content("#exportIssues"))
        page.click("#exportBackBtn")

        # ---- each academy keeps its own numbers
        page.click("#resetBtn")
        page.wait_for_selector("#pickerDialog[open]")
        page.locator('.academy-tile[data-academy="alison-apex"]').first.click()
        page.wait_for_timeout(900)
        page.fill("#invoiceNumber", "2026-11005")
        page.wait_for_timeout(300)
        check("another academy may use the same number", page.is_hidden("#invoiceNumberWarning"))
        page.click("#academyBtn")
        page.wait_for_selector("#pickerDialog[open]")
        check("the academy button changes this invoice's academy", page.text_content("#pickerTitle") == "Change the academy")
        page.locator('.academy-tile[data-academy="alison-janets"]').first.click()
        page.wait_for_timeout(900)
        check("the same number within one academy is flagged", page.is_visible("#invoiceNumberWarning")
              and "Janets Alison" in page.text_content("#invoiceNumberWarning"))
        page.keyboard.press("Control+z")
        page.wait_for_timeout(300)
        page.fill("#invoiceNumber", "AP-1")
        page.wait_for_timeout(500)

        # ---- the invoices board
        page.click("#navInvoices")
        page.wait_for_timeout(400)
        page.select_option("#boardPeriod", "Q3-2026")
        page.wait_for_timeout(300)
        check("the board is for a quarter", page.text_content("#boardTitle") == "Q3-2026 invoices")
        janets = page.locator('.board-row[data-academy="alison-janets"]')
        status_of = lambda academy: page.locator(f'.board-row[data-academy="{academy}"] .status-chip').first.text_content()
        overdue = today > "2026-11-20"
        check("Janets' Q3 invoice is issued (or overdue after its due date)",
              status_of("alison-janets") == ("Overdue" if overdue else "Issued"), status_of("alison-janets"))
        check("academies with no Q3 invoice are Not started, with Start", status_of("alison-mayfair") == "Not started"
              and page.locator('.board-row[data-academy="alison-mayfair"] button', has_text="Start Q3-2026").count() == 1)
        check("every Alison academy has a row", page.locator(".board-row").count() >= 18)
        janets.locator("button", has_text="Mark as paid").click()
        page.wait_for_timeout(300)
        check("Mark as paid on the board", status_of("alison-janets") == "Paid"
              and [e for e in index() if e["number"] == "2026-11005" and e["template"] == "alison-janets"][0]["paidDate"] == today)
        page.click('.filter-chip[data-filter="notstarted"]')
        check("filters show only one status", all(t == "Not started" for t in page.eval_on_selector_all(".board-row .status-chip", "c => c.map(x => x.textContent)")))
        page.click('.filter-chip[data-filter="all"]')
        page.select_option("#boardPeriod", "Q4-2026")
        page.wait_for_timeout(300)
        check("the next quarter shows Janets' draft with Continue", status_of("alison-janets") == "Draft"
              and page.locator('.board-row[data-academy="alison-janets"] button', has_text="Continue").count() == 1)
        page.screenshot(path=os.path.join(OUT, "board.png"))
        page.locator('.board-row[data-academy="alison-mayfair"] button', has_text="Start Q4-2026").click()
        page.wait_for_timeout(1000)
        check("Start on the board opens a new invoice for that academy and quarter",
              page.evaluate("() => document.body.dataset.view") == "editor" and page.input_value("#template") == "alison-mayfair"
              and page.input_value("#invoicePeriod") == "Q4-2026" and page.input_value("#companyName") != "")

        # ---- overdue is worked out from the due date
        page.fill("#invoiceDate", "2026-01-01"); page.fill("#dueDate", "2026-01-15")
        page.click("#statusBtn"); page.click('#statusMenu [data-status="issued"]')
        page.wait_for_timeout(300)
        check("an issued invoice past its due date shows Overdue", page.text_content("#statusBtnText") == "Overdue")

        # ---- All invoices, and the view in the address
        page.click("#navInvoices")
        page.click("#boardTabAll")
        page.fill("#invoiceSearch", "janets")
        page.wait_for_timeout(200)
        check("All invoices searches by academy", page.locator("#invoiceList .invoice-row").count() == 2)
        page.reload()
        page.wait_for_timeout(600)
        check("the view survives a reload (#invoices)", page.evaluate("() => document.body.dataset.view") == "invoices")
        page.go_back(); page.wait_for_timeout(300)
        page.click("#accountBtn")
        page.wait_for_timeout(200)
        check("the account button opens Settings", page.is_visible("#settingsTitle") and "#settings" in page.url)
        page.select_option("#pdfNameStyle", "number")
        page.click("#navEditor")
        page.click("#pdfBtn")
        page.wait_for_selector("#exportDialog[open]")
        check("Settings: PDF named by number only", page.input_value("#pdfFileName") == page.input_value("#invoiceNumber").strip("#"),
              page.input_value("#pdfFileName"))
        page.click("#exportBackBtn")
        page.screenshot(path=os.path.join(OUT, "editor-2.14.png"))
        browser.close()
finally:
    server.terminate()

check("no page or console errors", not errors, "; ".join(errors[:3]))
print(f"\n{sum(results)} passed, {len(results) - sum(results)} failed")
sys.exit(0 if all(results) else 1)
