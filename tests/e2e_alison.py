"""
The Alison templates, in headless Chromium against the local server:

    python3 tests/e2e_alison.py

For every Alison template: choosing it fills in the academy's details, logo
and Alison as the client; the page draws without errors; a long invoice (many
lines, a long address) grows onto more pages without anything overlapping;
printing includes it. Also: the Design menu groups (General, Fanatical,
Alison), undo after choosing, and that opening a saved invoice never
overwrites its details with the academy's.
"""

import os, subprocess, sys, time
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("E2E_PORT", "8784"))
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
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 1400, "height": 900})
        page = ctx.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(URL)
        page.wait_for_timeout(500)
        page.click("#tabbtn-design")

        groups = page.evaluate("""() => [...document.querySelectorAll('#template optgroup')].map(g => ({
            label: g.label, options: [...g.querySelectorAll('option')].map(o => ({ value: o.value, text: o.textContent })) }))""")
        labels = [g["label"] for g in groups]
        check("the Design menu is grouped General, Fanatical, Alison", labels == ["General", "Fanatical", "Alison"], str(labels))
        general = [o["text"] for o in groups[0]["options"]]
        check("Multipurpose ends the General group (the spacer follows it)", general[-1] == "Multipurpose", str(general))
        alison = groups[2]["options"] if len(groups) > 2 else []
        check("17 Alison templates, each named \"... Alison\"", len(alison) == 17 and all(o["text"].endswith(" Alison") for o in alison))
        registered = page.evaluate("""async ids => { const r = await import('/js/templates/template-registry.js'); return ids.filter(id => !r.has(id)); }""",
                                   [o["value"] for g in groups for o in g["options"]])
        check("every menu entry is a registered template", not registered, str(registered))

        overlaps, empty_fail, long_fail, print_fail, brand_fail = [], [], [], [], []
        for option in alison:
            tid, name = option["value"], option["text"]
            page.select_option("#template", tid)
            page.wait_for_timeout(450)
            info = page.evaluate("""async () => {
                const st = await import('/js/state.js');
                return { company: document.getElementById('companyName').value, client: document.getElementById('clientName').value,
                         currency: document.getElementById('currency').value, logo: Boolean(st.state.logo),
                         custom: !document.getElementById('pCustom').hidden, text: document.getElementById('pCustom').textContent };
            }""")
            brand_has_logo = page.evaluate("""async id => { const r = await import('/js/templates/template-registry.js'); return Boolean(r.get(id).capabilities.brand.logo); }""", tid)
            if not (info["company"] and info["client"] == "Alison" and info["currency"] == "EUR" and info["custom"]
                    and info["logo"] == brand_has_logo and "Alison" in info["text"]):
                brand_fail.append(f"{name}: {info['company']!r} {info['client']!r} logo={info['logo']}")

            # An empty invoice still draws.
            page.evaluate("""async () => { const s = await import('/js/session.js'); const d = await import('/js/invoice/invoice-data.js');
                const snap = d.serialize(); snap.items = []; s.applySnapshot(snap); }""")
            page.wait_for_timeout(100)
            if not page.evaluate("() => document.querySelectorAll('#pCustom .al-sec').length > 2"):
                empty_fail.append(name)

            # A long invoice: 40 lines and an eight-line address.
            page.evaluate("""async () => { const s = await import('/js/session.js'); const d = await import('/js/invoice/invoice-data.js');
                const snap = d.serialize();
                snap.items = Array.from({length: 40}, (_, i) => ({ description: 'Royalty line ' + (i + 1), quantity: 1, rate: 100 + i }));
                snap.fields.clientAddress = 'Line one\\nLine two\\nLine three\\nLine four\\nLine five\\nLine six\\nLine seven\\nLine eight';
                s.applySnapshot(snap); }""")
            page.wait_for_timeout(150)
            geo = page.evaluate("""() => {
                const page = document.querySelector('#pCustom .al-page');
                const secs = [...document.querySelectorAll('#pCustom .al-sec')].map(s => s.getBoundingClientRect());
                const bad = [];
                for (let i = 0; i + 1 < secs.length; i++) if (secs[i].bottom > secs[i + 1].top + 0.5) bad.push(i);
                // inside a section, nothing may stick out below it
                document.querySelectorAll('#pCustom .al-sec').forEach((s, i) => {
                    const r = s.getBoundingClientRect();
                    s.querySelectorAll('.al-i').forEach(el => { if (el.getBoundingClientRect().bottom > r.bottom + 0.5) bad.push('in' + i); });
                });
                return { bad, height: page.getBoundingClientRect().height, paper: parseFloat(getComputedStyle(page).minHeight),
                         text: page.textContent };
            }""")
            if geo["bad"]:
                overlaps.append(f"{name}: {geo['bad']}")
            if not (geo["height"] > geo["paper"] + 10 and "Royalty line 40" in geo["text"] and "Line eight" in geo["text"]):
                long_fail.append(name)

            printed = page.evaluate("""async () => { const p = await import('/js/print/print.js');
                const f = p.buildInvoicePrintDocument(false); const t = f?.contentDocument?.body?.textContent || ''; f?.remove(); return t; }""")
            if "Royalty line 40" not in printed or info["company"].split("|")[0].strip()[:6] not in printed:
                print_fail.append(name)

        check("choosing each Alison template fills in its academy, logo, EUR and Alison as the client", not brand_fail, "; ".join(brand_fail))
        check("each Alison template draws an empty invoice", not empty_fail, ", ".join(empty_fail))
        check("long invoices grow past one page and show every line", not long_fail, ", ".join(long_fail))
        check("nothing overlaps on long invoices", not overlaps, "; ".join(overlaps[:5]))
        check("printing includes the whole Alison invoice", not print_fail, ", ".join(print_fail))

        # Undo after choosing a template restores the earlier details.
        page.select_option("#template", "modern")
        page.wait_for_timeout(200)
        page.click("#tabbtn-invoice")
        page.fill("#companyName", "Before Choosing Ltd")
        page.wait_for_timeout(700)
        page.click("#tabbtn-design")
        page.select_option("#template", "alison-apex")
        page.wait_for_timeout(500)
        check("the academy's name replaces yours", page.input_value("#companyName") == "Apex Learning")
        check("a message says what was filled in", "Apex Learning" in (page.text_content("#toast") or ""))
        page.keyboard.press("Control+z")
        page.wait_for_timeout(400)
        check("Ctrl+Z brings your details back", page.input_value("#companyName") == "Before Choosing Ltd", page.input_value("#companyName"))

        # Switching back to a standard template shows the standard layout.
        page.select_option("#template", "alison-janets")
        page.wait_for_timeout(400)
        page.select_option("#template", "modern")
        page.wait_for_timeout(300)
        check("a standard template hides the Alison page again",
              page.evaluate("() => document.getElementById('pCustom').hidden && getComputedStyle(document.querySelector('#invoice .invtable')).display !== 'none'"))

        # A saved Alison invoice keeps its own details when opened again.
        page.select_option("#template", "alison-janets")
        page.wait_for_timeout(400)
        page.click("#tabbtn-invoice")
        page.fill("#companyName", "Edited Janets Ltd")
        page.wait_for_timeout(800)
        page.reload()
        page.wait_for_timeout(700)
        check("reopening keeps the edited details (the academy's are not filled in again)",
              page.input_value("#companyName") == "Edited Janets Ltd" and page.input_value("#template") == "alison-janets")
        check("and the Alison page is drawn after reloading", page.evaluate("() => !document.getElementById('pCustom').hidden && document.getElementById('pCustom').textContent.includes('Edited Janets Ltd')"))
        browser.close()
finally:
    server.terminate()

check("no page or console errors", not errors, "; ".join(errors[:3]))
print(f"\n{sum(results)} passed, {len(results) - sum(results)} failed")
sys.exit(0 if all(results) else 1)
