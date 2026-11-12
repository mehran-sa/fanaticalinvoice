"""
End-to-end check of Google Drive sync, in headless Chromium, with Google
replaced by a stand-in: no Google account or network is needed.

    python3 tests/e2e_drive_sync.py

Two separate browser profiles play two devices sharing one Drive. The test
serves the app on 127.0.0.1, sets a test client ID (js/config.js is replaced
for the test only), answers accounts.google.com/gsi/client with a fake
sign-in library that hands out tokens, and answers www.googleapis.com with an
in-memory Drive. The real Content Security Policy stays on, so the test also
proves the policy lets sync through. It fails on any other outside request.
"""

import json, os, re, subprocess, sys, time
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("E2E_PORT", "8782"))
ORIGIN = f"http://127.0.0.1:{PORT}"
URL = ORIGIN + "/index.html"

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))


# ------------------------------------------------------------ fake Google

CONFIG_JS = 'export const GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";\nexport const GOOGLE_HOSTED_DOMAIN = "";\n'

FAKE_GIS = """
window.__tokenRequests = 0;
window.google = { accounts: { oauth2: {
  initTokenClient(cfg) {
    return { requestAccessToken(opts) {
      window.__tokenRequests++;
      window.__lastPrompt = opts && opts.prompt;
      setTimeout(() => cfg.callback({ access_token: "tok-" + Math.random().toString(36).slice(2),
        expires_in: 3599, scope: cfg.scope }), 20);
    } };
  },
  hasGrantedAllScopes(r, s) { return String(r.scope || "").split(" ").includes(s); },
  revoke(t, cb) { cb && cb({ successful: true }); }
} } };
"""


class FakeDrive:
    def __init__(self):
        self.files = {}      # id -> {meta, content}
        self.next_id = 1
        self.requests = []
        self.uploads = 0

    def meta(self, f):
        return {k: f["meta"][k] for k in ("id", "name", "version", "modifiedTime")}

    def handle(self, route, request):
        cors = {"Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "authorization, content-type",
                "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS"}
        if request.method == "OPTIONS":
            return route.fulfill(status=204, headers=cors)
        u = urlparse(request.url)
        q = parse_qs(u.query)
        self.requests.append((request.method, u.path))
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer tok-"):
            return route.fulfill(status=401, headers=cors, content_type="application/json",
                                 body=json.dumps({"error": {"message": "Invalid Credentials"}}))
        ok = lambda body: route.fulfill(status=200, headers=cors, content_type="application/json",
                                        body=body if isinstance(body, str) else json.dumps(body))
        path = u.path
        if path == "/drive/v3/about":
            return ok({"user": {"displayName": "Test User", "emailAddress": "test.user@staffasia.org"}})
        if path == "/drive/v3/files" and request.method == "GET":
            qs = q.get("q", [""])[0]
            found = [self.meta(f) for f in self.files.values()
                     if "saInvoiceGeneratorSync" in qs and f["meta"]["appProperties"].get("saInvoiceGeneratorSync") == "1"]
            return ok({"files": found})
        m = re.fullmatch(r"/drive/v3/files/([^/]+)", path)
        if m and request.method == "GET":
            f = self.files.get(m.group(1))
            if not f:
                return route.fulfill(status=404, headers=cors, body="{}")
            if q.get("alt") == ["media"]:
                return ok(f["content"])
            return ok({**self.meta(f), "trashed": False})
        if path == "/upload/drive/v3/files" and request.method == "POST":
            body = request.post_data
            boundary = re.search(r"boundary=(\S+)", request.headers["content-type"]).group(1)
            parts = [p for p in body.split("--" + boundary) if p.strip() not in ("", "--")]
            metadata = json.loads(parts[0].split("\r\n\r\n", 1)[1].strip())
            content = parts[1].split("\r\n\r\n", 1)[1].rstrip("\r\n")
            fid = f"file{self.next_id}"
            self.next_id += 1
            self.files[fid] = {"meta": {"id": fid, "name": metadata["name"], "version": "1",
                                        "modifiedTime": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
                                        "appProperties": metadata.get("appProperties", {})}, "content": content}
            self.uploads += 1
            return ok(self.meta(self.files[fid]))
        m = re.fullmatch(r"/upload/drive/v3/files/([^/]+)", path)
        if m and request.method == "PATCH":
            f = self.files[m.group(1)]
            f["content"] = request.post_data
            f["meta"]["version"] = str(int(f["meta"]["version"]) + 1)
            self.uploads += 1
            return ok(self.meta(f))
        return route.fulfill(status=400, headers=cors, body="{}")

    def doc(self):
        return json.loads(next(iter(self.files.values()))["content"]) if self.files else None


# -------------------------------------------------------------------- run

server = subprocess.Popen([sys.executable, os.path.join(ROOT, "serve.py"), str(PORT), "--no-browser"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
drive = FakeDrive()
errors = []
outside = []

try:
    with sync_playwright() as p:
        browser = p.chromium.launch()

        def device(name):
            ctx = browser.new_context(viewport={"width": 1400, "height": 900})
            ctx.route(f"{ORIGIN}/js/config.js", lambda r: r.fulfill(status=200, content_type="text/javascript", body=CONFIG_JS))
            ctx.route("https://accounts.google.com/gsi/client", lambda r: r.fulfill(status=200, content_type="text/javascript", body=FAKE_GIS))
            ctx.route("https://www.googleapis.com/**", drive.handle)

            def other(route):
                url = route.request.url
                if url.startswith(ORIGIN) or url.startswith("data:") or url.startswith("blob:"):
                    return route.fallback()
                outside.append(url)
                return route.abort()
            ctx.route(re.compile(r"^(?!https://(www\.googleapis\.com|accounts\.google\.com/gsi/client)).*"), other)
            page = ctx.new_page()
            page.on("console", lambda m: m.type == "error" and errors.append(f"{name}: {m.text}"))
            page.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
            page.on("dialog", lambda d: (errors.append(f"{name}: browser popup {d.message}"), d.dismiss()))
            page.goto(URL)
            page.wait_for_timeout(400)
            page.click("#tabbtn-invoices")
            return ctx, page

        def wait_synced(page, timeout=15000):
            page.wait_for_function("""() => {
                const m = JSON.parse(localStorage.getItem('invoiceStudio.cloudSync.v1') || '{}');
                return m.email && !m.dirty && document.getElementById('cloudChip').classList.contains('saved');
            }""", timeout=timeout)

        def sync(page):
            page.click("#tabbtn-invoices")
            page.click("#cloudSyncBtn")
            page.wait_for_timeout(300)
            wait_synced(page)

        def numbers(page):
            return sorted(page.evaluate("() => JSON.parse(localStorage.getItem('invoiceStudio.invoiceIndex.v1') || '[]').map(e => e.number)"))

        def confirm(page):
            page.wait_for_selector("#appConfirmDialog[open]")
            page.click("#appConfirmAccept")
            page.wait_for_timeout(200)

        # ---- device A: works locally first, then signs in
        a_ctx, a = device("A")
        check("sync panel shows when a client ID is set", a.is_visible("#panel-cloud") and a.is_visible("#cloudSignInBtn"))
        check("no Drive status chip before sign-in", a.is_hidden("#cloudChip"))
        a.click("#tabbtn-invoice")
        a.fill("#invoiceNumber", "A-100")
        a.fill("#clientName", "Acme Ltd")
        a.wait_for_timeout(500)
        check("nothing is sent to Google before sign-in", not drive.requests)

        a.click("#tabbtn-invoices")
        a.click("#cloudSignInBtn")
        wait_synced(a)
        check("sign-in shows the account", "test.user@staffasia.org" in a.text_content("#cloudSignedIn"))
        check("privacy note says data is synced", "Google Drive" in a.text_content("#privacyNoticeText"))
        doc = drive.doc()
        check("first sync creates one backup-format file in Drive",
              len(drive.files) == 1 and doc["format"] == "sa-invoice-generator-backup" and doc["version"] == 1)
        check("the invoice made before sign-in is in Drive", [i["summary"]["number"] for i in doc["invoices"]] == ["A-100"])

        # ---- automatic upload after an edit
        uploads = drive.uploads
        a.click("#tabbtn-invoice")
        a.fill("#clientName", "Acme Holdings")
        a.wait_for_timeout(300)
        check("an edit marks changes as waiting", "pending" in a.get_attribute("#cloudChip", "class"))
        wait_synced(a, timeout=20000)
        check("an edit uploads automatically a few seconds later",
              drive.uploads == uploads + 1 and drive.doc()["invoices"][0]["summary"]["client"] == "Acme Holdings")

        # ---- device B: fresh browser, signs in, continues
        b_ctx, b = device("B")
        b.click("#cloudSignInBtn")
        wait_synced(b)
        b.wait_for_timeout(300)
        check("a new device gets the invoices from Drive", numbers(b) == ["A-100"])
        check("a new device opens the latest invoice from Drive", b.input_value("#invoiceNumber") == "A-100"
              and "Acme Holdings" in b.input_value("#clientName"))
        check("the empty starting invoice on the new device is not uploaded", len(drive.doc()["invoices"]) == 1)

        # ---- edit on B, appears on A in the open editor
        b.click("#tabbtn-invoice")
        b.fill("#reference", "PO-778")
        b.wait_for_timeout(500)
        b.click("#tabbtn-invoices")
        sync(b)
        sync(a)
        check("an edit on one device reaches the other device's open invoice", a.input_value("#reference") == "PO-778")

        # ---- new invoice on A, deleted on B, gone from A
        a.click("#resetBtn")
        a.wait_for_timeout(300)
        new_number = a.input_value("#invoiceNumber")
        a.click("#tabbtn-invoices")
        sync(a)
        sync(b)
        check("a new invoice on one device appears on the other", numbers(b) == sorted(["A-100", new_number]), str(numbers(b)))
        b.locator(".invoice-row", has_text=new_number).locator("button", has_text="Delete").click()
        b.wait_for_selector("#appConfirmDialog[open]")
        check("delete warning mentions other devices", "other devices" in b.text_content("#appConfirmMessage"))
        b.click("#appConfirmAccept")
        b.wait_for_timeout(200)
        sync(b)
        check("the deletion is recorded in Drive", any(True for _ in drive.doc()["deleted"]) and
              new_number not in [i["summary"]["number"] for i in drive.doc()["invoices"]])
        sync(a)
        a.wait_for_timeout(300)
        check("an invoice deleted on one device is deleted on the other", numbers(a) == ["A-100"], str(numbers(a)))
        check("the device that had it open moves to another invoice", a.input_value("#invoiceNumber") == "A-100")
        sync(a)
        sync(b)
        check("a deleted invoice does not come back", numbers(a) == ["A-100"] and numbers(b) == ["A-100"])

        # ---- client book follows (add on A, delete on B)
        a.evaluate("""() => { const l = JSON.parse(localStorage.getItem('invoiceStudio.clients.v1') || '[]');
            l.push({id: 'c-zeta', name: 'Zeta Co', contact: '', tax: '', address: '', email: ''});
            localStorage.setItem('invoiceStudio.clients.v1', JSON.stringify(l)); }""")
        # Written outside the app's storage functions, so ask for a sync by hand.
        a.evaluate("() => { const m = JSON.parse(localStorage.getItem('invoiceStudio.cloudSync.v1')); m.dirty = true; localStorage.setItem('invoiceStudio.cloudSync.v1', JSON.stringify(m)); }")
        sync(a)
        sync(b)
        names = lambda pg: [c["name"] for c in pg.evaluate("() => JSON.parse(localStorage.getItem('invoiceStudio.clients.v1') || '[]')")]
        check("a saved client reaches the other device", "Zeta Co" in names(b))

        # ---- expired sign-in: work continues, Reconnect renews it
        a.evaluate("() => { const t = JSON.parse(localStorage.getItem('invoiceStudio.cloudToken.v1')); t.expiresAt = Date.now() - 1000; localStorage.setItem('invoiceStudio.cloudToken.v1', JSON.stringify(t)); }")
        a.click("#tabbtn-invoice")
        a.fill("#notes", "Thanks for your business")
        a.wait_for_timeout(800)
        check("an expired sign-in shows Reconnect, and saving here carries on",
              "reconnect" in a.get_attribute("#cloudChip", "class") and "Reconnect" in a.text_content("#cloudChipText")
              and "Saved" in a.text_content("#saveStateText"))
        a.click("#cloudChip")
        wait_synced(a)
        check("Reconnect renews sign-in without the account chooser and uploads the waiting change",
              a.evaluate("() => window.__lastPrompt") == "" and
              "Thanks for your business" in json.dumps(drive.doc()["invoices"]))

        # ---- reload keeps sign-in (within the hour) and syncs on open
        b.reload()
        b.wait_for_timeout(400)
        wait_synced(b)
        check("after a reload the device is still signed in and up to date",
              b.is_visible("#cloudChip") and "Thanks for your business" in b.evaluate("() => JSON.stringify(localStorage)"))

        # ---- sign out on a shared computer removes the local copy
        b.click("#tabbtn-invoices")
        b.click("#cloudSignOutBtn")
        confirm(b)
        b.wait_for_selector("#appConfirmDialog[open]")
        check("sign-out offers to remove the local copy", "Remove" in b.text_content("#appConfirmAccept"))
        b.click("#appConfirmAccept")
        b.wait_for_load_state()
        b.wait_for_timeout(600)
        check("removing the local copy leaves no invoices in that browser", numbers(b) == []
              and not b.evaluate("() => Object.keys(localStorage).some(k => k.startsWith('invoiceStudio.invoice.'))"))
        b.click("#tabbtn-invoices")
        check("after sign-out the panel offers sign-in again", b.is_visible("#cloudSignInBtn") and b.is_hidden("#cloudChip"))
        check("Drive still has everything after one device signs out", [i["summary"]["number"] for i in drive.doc()["invoices"]] == ["A-100"])

        # ---- signing back in brings it all back
        b.click("#cloudSignInBtn")
        wait_synced(b)
        b.wait_for_timeout(300)
        check("signing in again brings everything back", numbers(b) == ["A-100"] and b.input_value("#invoiceNumber") == "A-100")

        # ---- the Drive file restores with the ordinary "Restore from backup"
        c_ctx = browser.new_context()
        c = c_ctx.new_page()
        c.goto(URL)
        c.wait_for_timeout(400)
        c.click("#tabbtn-invoices")
        path = os.path.join(ROOT, "tests", "output", "drive-sync-file.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(drive.files["file1"]["content"])
        c.set_input_files("#restoreFile", path)
        confirm(c)
        check("the Drive file also works with Restore from backup", numbers(c) == ["A-100"])

        a.screenshot(path=os.path.join(ROOT, "tests", "output", "drive-sync-signed-in.png"))
        browser.close()
finally:
    server.terminate()

check("no console or page errors (including blocked by the security policy)", not errors, "; ".join(errors[:5]))
check("no requests outside 127.0.0.1 and Google's sign-in and Drive addresses", not outside, ", ".join(outside[:5]))

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
sys.exit(1 if failed else 0)
