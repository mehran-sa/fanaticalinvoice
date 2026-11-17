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
from unlock_helper import prepare_browser, raw_context, TEST_PASSWORD, test_single_file

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
    """An in-memory Drive: files and folders with parents and app properties."""

    def __init__(self):
        self.files = {}      # id -> {meta, content}
        self.next_id = 1
        self.requests = []
        self.uploads = 0
        self.clock = 0

    def stamp(self):
        self.clock += 1
        return time.strftime("%Y-%m-%dT%H:%M:", time.gmtime()) + f"{self.clock % 60:02d}.{self.clock:06d}Z"

    def meta(self, f):
        m = f["meta"]
        return {k: m[k] for k in ("id", "name", "version", "modifiedTime", "createdTime", "appProperties", "mimeType") if k in m} | \
               ({"size": str(len(f["content"]))} if f.get("content") is not None else {})

    def add(self, name, content, app_properties, parents=None, mime="application/json"):
        fid = f"file{self.next_id}"
        self.next_id += 1
        now = self.stamp()
        self.files[fid] = {"meta": {"id": fid, "name": name, "version": "1", "modifiedTime": now, "createdTime": now,
                                    "appProperties": app_properties or {}, "parents": parents or ["root"], "mimeType": mime},
                           "content": content}
        return fid

    def by_property(self, key):
        return [f for f in self.files.values() if f["meta"]["appProperties"].get(key) == "1"]

    def sync_file(self):
        found = self.by_property("saInvoiceGeneratorSync")
        return found[0] if found else None

    def handle(self, route, request):
        cors = {"Access-Control-Allow-Origin": ORIGIN, "Access-Control-Allow-Headers": "authorization, content-type",
                "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"}
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
            prop = re.search(r"key='(\w+)' and value='(\w+)'", qs)
            found = [f for f in self.files.values()
                     if prop and f["meta"]["appProperties"].get(prop.group(1)) == prop.group(2)
                     and ("mimeType" not in qs or f["meta"]["mimeType"] == "application/vnd.google-apps.folder")]
            order = q.get("orderBy", [""])[0]
            found.sort(key=lambda f: f["meta"]["createdTime"], reverse="desc" in order)
            return ok({"files": [self.meta(f) for f in found]})
        if path == "/drive/v3/files" and request.method == "POST":
            body = json.loads(request.post_data)
            fid = self.add(body["name"], None, body.get("appProperties"), body.get("parents"), body.get("mimeType"))
            return ok({"id": fid, "name": body["name"]})
        m = re.fullmatch(r"/drive/v3/files/([^/]+)", path)
        if m and request.method == "GET":
            f = self.files.get(m.group(1))
            if not f:
                return route.fulfill(status=404, headers=cors, body="{}")
            if q.get("alt") == ["media"]:
                return ok(f["content"])
            return ok({**self.meta(f), "trashed": False, "parents": f["meta"]["parents"]})
        if m and request.method == "PATCH":
            f = self.files.get(m.group(1))
            if not f:
                return route.fulfill(status=404, headers=cors, body="{}")
            parents = [p for p in f["meta"]["parents"] if p not in q.get("removeParents", [""])[0].split(",")]
            for add in q.get("addParents", [""])[0].split(","):
                if add and add not in parents:
                    parents.append(add)
            f["meta"]["parents"] = parents
            return ok({"id": f["meta"]["id"]})
        if m and request.method == "DELETE":
            self.files.pop(m.group(1), None)
            return route.fulfill(status=204, headers=cors, body="")
        if path == "/upload/drive/v3/files" and request.method == "POST":
            body = request.post_data
            boundary = re.search(r"boundary=(\S+)", request.headers["content-type"]).group(1)
            parts = [p for p in body.split("--" + boundary) if p.strip() not in ("", "--")]
            metadata = json.loads(parts[0].split("\r\n\r\n", 1)[1].strip())
            content = parts[1].split("\r\n\r\n", 1)[1].rstrip("\r\n")
            fid = self.add(metadata["name"], content, metadata.get("appProperties", {}), metadata.get("parents"))
            self.uploads += 1
            return ok(self.meta(self.files[fid]))
        m = re.fullmatch(r"/upload/drive/v3/files/([^/]+)", path)
        if m and request.method == "PATCH":
            f = self.files[m.group(1)]
            f["content"] = request.post_data
            f["meta"]["version"] = str(int(f["meta"]["version"]) + 1)
            f["meta"]["modifiedTime"] = self.stamp()
            self.uploads += 1
            return ok(self.meta(f))
        return route.fulfill(status=400, headers=cors, body="{}")

    def doc(self):
        f = self.sync_file()
        return json.loads(f["content"]) if f else None


# -------------------------------------------------------------------- run

server = subprocess.Popen([sys.executable, os.path.join(ROOT, "serve.py"), str(PORT), "--no-browser"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(0.8)
drive = FakeDrive()
errors = []
outside = []

try:
    with sync_playwright() as p:
        browser = prepare_browser(p.chromium.launch())

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
            settings(page)
            return ctx, page

        def view(page):
            return page.evaluate("() => document.body.dataset.view")

        def settings(page):
            if view(page) != "settings":
                page.click("#accountBtn")
                page.wait_for_timeout(150)

        def editor(page):
            if view(page) != "editor":
                page.click("#navEditor")
                page.wait_for_timeout(150)
            page.click("#tabbtn-invoice")

        def all_invoices(page):
            if view(page) != "invoices":
                page.click("#navInvoices")
                page.wait_for_timeout(150)
            page.click("#boardTabAll")
            page.wait_for_timeout(150)

        def wait_synced(page, timeout=15000):
            page.wait_for_function("""() => {
                const m = JSON.parse(localStorage.getItem('invoiceStudio.cloudSync.v1') || '{}');
                return m.email && !m.dirty && document.getElementById('cloudChip').classList.contains('saved');
            }""", timeout=timeout)

        def sync(page):
            settings(page)
            page.click("#cloudSyncBtn")
            page.wait_for_timeout(300)
            wait_synced(page)

        def numbers(page):
            return sorted(page.evaluate("() => JSON.parse(localStorage.getItem('invoiceStudio.invoiceIndex.v1') || '[]').map(e => e.number)"))

        def confirm(page):
            page.wait_for_selector("#appConfirmDialog[open]")
            page.click("#appConfirmAccept")
            page.wait_for_timeout(200)

        # ---- a sync file from before 2.14.0 sits in the root of Drive
        old_root = drive.add("SA Invoice Generator - sync.json", json.dumps({"format": "sa-invoice-generator-backup", "version": 1,
                             "invoices": [], "logos": {}, "clients": [], "templates": [], "brands": []}), {"saInvoiceGeneratorSync": "1"})

        # ---- device A: works locally first, then signs in
        a_ctx, a = device("A")
        check("sync panel shows when a client ID is set", a.is_visible("#panel-cloud") and a.is_visible("#cloudSignInBtn"))
        check("no Drive status chip before sign-in", a.is_hidden("#cloudChip"))
        editor(a)
        a.fill("#invoiceNumber", "A-100")
        a.fill("#clientName", "Acme Ltd")
        a.wait_for_timeout(500)
        check("nothing is sent to Google before sign-in", not drive.requests)

        settings(a)
        a.click("#cloudSignInBtn")
        wait_synced(a)
        a.wait_for_timeout(500)
        check("sign-in shows the account", "test.user@staffasia.org" in a.text_content("#cloudSignedIn"))
        check("privacy note says data is synced", "Google Drive" in a.text_content("#privacyNoticeText"))
        doc = drive.doc()
        folders = drive.by_property("saInvoiceGeneratorFolder")
        backups_folders = drive.by_property("saInvoiceGeneratorBackups")
        check("first sync keeps one backup-format sync file in Drive",
              len(drive.by_property("saInvoiceGeneratorSync")) == 1 and doc["format"] == "sa-invoice-generator-backup" and doc["version"] == 1)
        check("the app makes one SA Invoice Generator folder with a Backups folder inside",
              len(folders) == 1 and folders[0]["meta"]["name"] == "SA Invoice Generator" and len(backups_folders) == 1
              and backups_folders[0]["meta"]["parents"] == [folders[0]["meta"]["id"]])
        check("a sync file from before 2.14.0 is moved out of the root into the folder",
              drive.sync_file()["meta"]["id"] == old_root and drive.sync_file()["meta"]["parents"] == [folders[0]["meta"]["id"]])
        check("the invoice made before sign-in is in Drive", [i["summary"]["number"] for i in doc["invoices"]] == ["A-100"])
        backups = drive.by_property("saInvoiceGeneratorBackup")
        check("the first sync of the day makes a dated backup in the Backups folder",
              len(backups) == 1 and re.fullmatch(r"\d{4}-\d{2}-\d{2} Backup\.json", backups[0]["meta"]["name"])
              and backups[0]["meta"]["parents"] == [backups_folders[0]["meta"]["id"]]
              and json.loads(backups[0]["content"])["format"] == "sa-invoice-generator-backup", str([b["meta"]["name"] for b in backups]))
        a.wait_for_selector("#driveBackupList .backup-item")
        check("Settings lists the Drive backup with Restore",
              a.locator("#driveBackupList .backup-item").count() == 1 and a.is_visible("#driveBackupList button:has-text('Restore')"))
        check("Open folder links to the app's folder", folders[0]["meta"]["id"] in a.get_attribute("#driveFolderLink", "href"))

        # ---- automatic upload after an edit
        uploads = drive.uploads
        editor(a)
        a.fill("#clientName", "Acme Holdings")
        a.wait_for_timeout(300)
        check("an edit marks changes as waiting", "pending" in a.get_attribute("#cloudChip", "class")
              and a.text_content("#cloudChipText") == "Saving to Drive")
        wait_synced(a, timeout=20000)
        check("an edit uploads automatically a few seconds later",
              drive.uploads == uploads + 1 and drive.doc()["invoices"][0]["summary"]["client"] == "Acme Holdings")
        check("no second backup on the same day", len(drive.by_property("saInvoiceGeneratorBackup")) == 1)
        a.click("#cloudChip")
        check("the sync button opens details with Sync now", a.is_visible("#syncPopover") and "Synced" in a.text_content("#syncPopTitle")
              and a.is_visible("#syncPopSyncBtn"))
        a.keyboard.press("Escape")
        check("Escape closes the sync details", a.is_hidden("#syncPopover"))

        # ---- device B: fresh browser, signs in, continues
        b_ctx, b = device("B")
        b.click("#cloudSignInBtn")
        wait_synced(b)
        b.fill("#deviceName", "Laptop")
        b.locator("#deviceName").blur()
        b.wait_for_timeout(300)
        check("a new device gets the invoices from Drive", numbers(b) == ["A-100"])
        check("a new device opens the latest invoice from Drive", b.input_value("#invoiceNumber") == "A-100"
              and "Acme Holdings" in b.input_value("#clientName"))
        check("the empty starting invoice on the new device is not uploaded", len(drive.doc()["invoices"]) == 1)

        # ---- edit on B, appears on A in the open editor
        editor(b)
        b.fill("#reference", "PO-778")
        b.wait_for_timeout(500)
        sync(b)
        sync(a)
        check("an edit on one device reaches the other device's open invoice", a.input_value("#reference") == "PO-778")
        check("Settings says which device the last change came from", "came from Laptop" in a.text_content("#syncLastRemote"))

        # ---- new invoice on A, deleted on B, gone from A
        editor(a)
        a.click("#resetBtn")
        a.wait_for_selector("#pickerDialog[open]")
        a.click("#pickerBlankBtn")
        a.wait_for_timeout(300)
        new_number = a.input_value("#invoiceNumber")
        sync(a)
        sync(b)
        check("a new invoice on one device appears on the other", numbers(b) == sorted(["A-100", new_number]), str(numbers(b)))
        all_invoices(b)
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

        # ---- expired sign-in: renewed on the next click (Stay signed in)
        expire = "() => { const t = JSON.parse(localStorage.getItem('invoiceStudio.cloudToken.v1')); t.expiresAt = Date.now() - 1000; localStorage.setItem('invoiceStudio.cloudToken.v1', JSON.stringify(t)); }"
        editor(a)
        a.evaluate(expire)
        a.fill("#notes", "Thanks for your business")
        a.wait_for_timeout(800)
        check("an expired sign-in shows Renewing sign-in, and saving here carries on",
              "renewing" in a.get_attribute("#cloudChip", "class") and "Renewing sign-in" in a.text_content("#cloudChipText")
              and "Saved" in a.text_content("#saveStateText"))
        requests_before = a.evaluate("() => window.__tokenRequests")
        a.click("#reference")
        wait_synced(a)
        check("the next click renews the sign-in by itself (no account chooser) and uploads the waiting change",
              a.evaluate("() => window.__tokenRequests") == requests_before + 1 and a.evaluate("() => window.__lastPrompt") == "" and
              "Thanks for your business" in json.dumps(drive.doc()["invoices"]))

        # ---- without Stay signed in: Click to keep syncing
        settings(a)
        a.click("#staySignedInToggle")
        a.evaluate(expire)
        editor(a)
        a.fill("#notes", "Thanks again")
        a.wait_for_timeout(800)
        check("with Stay signed in off, an expired sign-in asks for a click",
              "reconnect" in a.get_attribute("#cloudChip", "class") and "Click to keep syncing" in a.text_content("#cloudChipText"))
        a.click("#cloudChip")
        wait_synced(a)
        check("clicking the sync button reconnects and uploads", "Thanks again" in json.dumps(drive.doc()["invoices"]))
        settings(a)
        a.click("#staySignedInToggle")

        # ---- Sync automatically off: nothing uploads until Sync now
        a.click("#autoSyncToggle")
        uploads = drive.uploads
        editor(a)
        a.fill("#notes", "Held back")
        a.wait_for_timeout(8000)
        check("with automatic sync off, a change is not uploaded", drive.uploads == uploads
              and "Sync is off" in a.text_content("#cloudChipText"))
        a.click("#cloudChip")
        a.click("#syncPopSyncBtn")
        a.wait_for_timeout(1500)
        check("Sync now still uploads with automatic sync off", "Held back" in json.dumps(drive.doc()["invoices"]))
        settings(a)
        a.click("#autoSyncToggle")

        # ---- Back up now, then restore from a Drive backup
        a.click("#driveBackupNowBtn")
        a.wait_for_timeout(1500)
        backups = sorted(b["meta"]["name"] for b in drive.by_property("saInvoiceGeneratorBackup"))
        check("Back up now adds a second, time-stamped backup the same day",
              len(backups) == 2 and any(re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}\.\d{2} Backup\.json", n) for n in backups)
              and any(re.fullmatch(r"\d{4}-\d{2}-\d{2} Backup\.json", n) for n in backups), str(backups))
        check("the backup list shows both", a.locator("#driveBackupList .backup-item").count() == 2)

        # ---- reload keeps sign-in (within the hour) and syncs on open
        b.reload()
        b.wait_for_timeout(400)
        wait_synced(b)
        check("after a reload the device is still signed in and up to date",
              b.is_visible("#cloudChip") and "Held back" in b.evaluate("() => JSON.stringify(localStorage)"))

        # ---- sign out on a shared computer removes the local copy
        settings(b)
        b.click("#cloudSignOutBtn")
        confirm(b)
        b.wait_for_selector("#appConfirmDialog[open]")
        check("sign-out offers to remove the local copy", "Remove" in b.text_content("#appConfirmAccept"))
        # The page reloads (and unlocks again: removing the local copy also
        # forgets the remembered master password), so wait for that reload.
        with b.expect_navigation():
            b.click("#appConfirmAccept")
        b.wait_for_selector("#appBar", state="visible")
        b.wait_for_timeout(600)
        check("removing the local copy leaves no invoices in that browser", numbers(b) == []
              and not b.evaluate("() => Object.keys(localStorage).some(k => k.startsWith('invoiceStudio.invoice.'))"))
        settings(b)
        check("after sign-out the panel offers sign-in again", b.is_visible("#cloudSignInBtn") and b.is_hidden("#cloudChip"))
        check("Drive still has everything after one device signs out", [i["summary"]["number"] for i in drive.doc()["invoices"]] == ["A-100"])

        # ---- signing back in brings it all back
        b.click("#cloudSignInBtn")
        wait_synced(b)
        b.wait_for_timeout(300)
        check("signing in again brings everything back", numbers(b) == ["A-100"] and b.input_value("#invoiceNumber") == "A-100")

        # ---- restore from a Drive backup on B: a deleted invoice comes back
        all_invoices(b)
        b.locator(".invoice-row", has_text="A-100").locator("button", has_text="Delete").click()
        confirm(b)
        check("the invoice is gone before the restore", "A-100" not in numbers(b))
        settings(b)
        b.wait_for_selector("#driveBackupList .backup-item")
        b.locator("#driveBackupList .backup-item").last.locator("button", has_text="Restore").click()
        confirm(b)
        b.wait_for_timeout(300)
        check("a Drive backup restores like a backup file", "A-100" in numbers(b), str(numbers(b)))

        # ---- the Drive file restores with the ordinary "Restore from backup"
        c_ctx = browser.new_context()
        c = c_ctx.new_page()
        c.goto(URL + "#settings")
        c.wait_for_timeout(400)
        path = os.path.join(ROOT, "tests", "output", "drive-sync-file.json")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            f.write(drive.sync_file()["content"])
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
