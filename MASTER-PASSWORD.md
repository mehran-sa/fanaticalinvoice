# Master password

SA Invoice Generator opens only with the master password. Until it is entered,
the app shows a lock screen and nothing else runs.

## What it protects

The 18 Alison academies' company, bank, PayPal and address details are **not
in the code**. They are in `js/secure/vault.js`, encrypted with the master
password (AES-256-GCM, with the key made from the password by PBKDF2-SHA256,
600,000 rounds). Without the password they cannot be read, even by someone who
downloads the app's files from GitHub Pages. Nothing about the password itself
is stored anywhere: a wrong password simply fails to decrypt.

On each device, "Remember on this device for 30 days" keeps the decryption key
in the browser as a non-extractable key: the app can use it, but it cannot be
read out or copied. **Settings > This device > Lock now** forgets it. Changing
the master password makes every remembered key stop working, so everyone is
asked again.

## What it does not protect

- **The rest of the app's files** (the design, templates and logos) are still
  public on GitHub Pages; only the details above are secret.
- **Git history.** If the repository is public, the details were readable in
  commits made before 2.15.0. Make the repository private, or remove those
  commits from its history, and consider whether any of the details should be
  changed.
- **Invoices already on a device.** Saved invoices stay in that browser (and in
  the person's own Google Drive). The lock screen stops people opening the
  app; it does not encrypt what a browser has stored. On a shared computer, use
  Settings > This device > Remove from this browser.

For stronger protection, host the app behind a sign-in (for example Cloudflare
Pages with Cloudflare Access, limited to staffasia.org Google accounts).

## For the admin

Needs Node.js 18 or later (as for `npm run build`).

| Task | Command |
|---|---|
| Change the master password | `npm run vault -- change-password` |
| Edit an academy's details | `npm run vault -- open`, edit `secrets/academy-details.json`, then `npm run vault -- seal` |
| Check a password | `npm run vault -- check` |

After `seal` or `change-password`, run `npm run build` and commit
`js/secure/vault.js` and `SA-Invoice-Generator.html`. Then tell the team the
new password.

`secrets/academy-details.json` is the readable copy. Keep it on your computer
only and **never commit it**; `.gitignore` already leaves it out. If it is
lost, `npm run vault -- open` writes it again from the vault.

A new Alison academy needs an entry in `secrets/academy-details.json` (under
its template id, for example `"alison-newacademy"`), with the same `fields`
and `client` keys as the others.

## Tests

The tests never use the real password. They use `tests/fixtures/vault.test.js`
(password `test-password-123`), made from
`tests/fixtures/academy-details.test.json`: the same academy names and
addresses, with every bank, PayPal and registration digit replaced by 0.
`tests/vault.test.mjs` also fails if a real-looking IBAN, sort code or account
number appears anywhere in the code or tests.
