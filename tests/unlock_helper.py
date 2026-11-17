"""
The tests open the app with a test vault (tests/fixtures/vault.test.js:
real academy names and addresses, every bank, PayPal and registration digit
replaced by 0) and its test password, never the real master password.

    from unlock_helper import prepare_browser, TEST_PASSWORD, raw_context
    browser = p.chromium.launch(); prepare_browser(browser)

Every new context then gets the test vault in place of js/secure/vault.js and
the test password (the app still checks it). raw_context(browser, ...) makes a
context without the password, to test the lock screen itself.

For the single-file build, test_single_file() builds a copy with the test
vault in tests/output and returns its path.
"""

import json, os, subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_PASSWORD = "test-password-123"
VAULT_BODY = open(os.path.join(ROOT, "tests", "fixtures", "vault.test.js"), encoding="utf-8").read()


def _serve_vault(route):
    route.fulfill(status=200, content_type="text/javascript", body=VAULT_BODY)


def add_test_vault(context, password=True):
    context.route("**/js/secure/vault.js", _serve_vault)
    if password:
        context.add_init_script(f"window.SA_UNLOCK_PASSWORD = {json.dumps(TEST_PASSWORD)};")
    return context


def prepare_browser(browser):
    original = browser.new_context

    def new_context(*args, **kwargs):
        return add_test_vault(original(*args, **kwargs))

    browser._raw_new_context = original
    browser.new_context = new_context
    return browser


def raw_context(browser, **kwargs):
    """A context with the test vault but no password: the lock screen shows."""
    make = getattr(browser, "_raw_new_context", browser.new_context)
    return add_test_vault(make(**kwargs), password=False)


def test_single_file():
    out = os.path.join(ROOT, "tests", "output", "SA-Invoice-Generator.test.html")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    env = dict(os.environ, SA_VAULT="tests/fixtures/vault.test.js", SA_OUT=os.path.relpath(out, ROOT))
    subprocess.run(["node", os.path.join(ROOT, "tools", "build-single-file.mjs")], cwd=ROOT, env=env, check=True,
                   stdout=subprocess.DEVNULL)
    return out
