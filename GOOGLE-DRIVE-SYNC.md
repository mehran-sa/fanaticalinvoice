# Google sign-in and Google Drive sync

From version 2.11.0, people can **Sign in with Google** in SA Invoice Generator.
Their saved invoices, clients, templates and brands are then kept in their own
Google Drive. When they sign in on any other computer or phone, everything is
there and they can carry on.

The feature stays **off** until you add a Google client ID (step 4 below). With
no client ID, the app works exactly as before, on one device only.

---

## One-time setup (about 10 minutes, done once by an admin)

You need a Google account that can use Google Cloud Console. For StaffAsia,
use a staffasia.org Workspace account.

### 1. Create a Google Cloud project
1. Open <https://console.cloud.google.com/>.
2. Use the project picker at the top and choose **New project**. Name it
   something like `SA Invoice Generator`, then click **Create**.

### 2. Turn on the Google Drive API
1. Go to **APIs & Services → Library**.
2. Search for **Google Drive API**, open it, and click **Enable**.

### 3. Set up the consent screen
Go to **APIs & Services → OAuth consent screen** (Google may call this
**Google Auth Platform**).

1. **App name:** `SA Invoice Generator`. **User support email:** your email.
2. **Audience / User type:**
   - **Internal** (recommended for StaffAsia): only accounts in your Google
     Workspace (staffasia.org) can sign in. Google does not review the app.
   - **External**: anyone with a Google account can sign in. Click **Publish
     app** when you are ready. The app asks only for `drive.file`, which
     Google rates as non-sensitive, so a full security review should not be
     needed.
3. **Data access / Scopes:** add
   `https://www.googleapis.com/auth/drive.file`
   ("See, edit, create and delete only the specific Google Drive files you use
   with this app"). Do not add any other scope.
4. **Contact email:** your email. Save.

### 4. Create the client ID
1. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. **Application type:** Web application. **Name:** `SA Invoice Generator web`.
3. **Authorized JavaScript origins:** add the address the app is served
   from. Use the scheme and host only, with no path and no trailing slash:
   - GitHub Pages: `https://YOUR-ORG.github.io` (for example
     `https://staffasia.github.io`, even if the app lives at
     `https://staffasia.github.io/fanaticalinvoice/`)
   - a custom domain, if you use one: `https://invoices.staffasia.org`
   - for local testing with `python3 serve.py`: `http://localhost:8000`
     (and `http://localhost`)
4. Leave **Authorized redirect URIs** empty. Click **Create**.
5. Copy the **Client ID**. It looks like
   `1234567890-abc123.apps.googleusercontent.com`. It is not a secret: it
   identifies the app and is safe to commit. Do **not** create or use a client
   secret; the app does not need one.

### 5. Put the client ID in the app
Edit `js/config.js`:

```js
export const GOOGLE_CLIENT_ID = "1234567890-abc123.apps.googleusercontent.com";
export const GOOGLE_HOSTED_DOMAIN = "staffasia.org"; // optional hint, or ""
```

Commit and push. GitHub Pages republishes in a minute or two. If you also
hand out the single-file `SA-Invoice-Generator.html`, run `npm run build`.
Google sign-in cannot work in that file, because it opens from disk, so it
shows a note pointing people to the website.

---

## How it works for staff

- **Sign in:** go to **Saved → Google Drive sync → Sign in with Google**. On the
  first sign-in, any invoices already in that browser go up to Drive.
- **New device:** open the website, sign in, and every invoice, client,
  template and brand appears. The latest invoice opens.
- **Automatic:** changes upload a few seconds after they are made. The app also
  syncs when it opens, when its tab is shown again, and every few minutes while
  it is open. The chip under "Saved" at the top shows the state: **Synced**,
  **Syncing…**, **Reconnect Drive** or **Offline**.
- **Reconnect:** without a server, a Google sign-in in the browser lasts about
  an hour and can only be renewed from a click. When it runs out, the app keeps
  working and saving in the browser. Click **Reconnect Drive**: Google's window
  flashes and closes by itself, and waiting changes upload.
- **Both devices changed something:** for each invoice, the version changed
  most recently wins. Deleting an invoice deletes it on every device, unless it
  was edited somewhere after the deletion. For clients, templates and brands,
  a change made on one device replaces the list on the others. If both changed
  it, the two lists are combined.
- **Shared or borrowed computer:** **Sign out**, then choose **Remove from this
  browser**. Everything stays safe in Drive.
- **Where the data is:** one file, `SA Invoice Generator - sync.json`, in the
  person's **own** My Drive. Each person has their own data; nothing is shared
  between colleagues. The file is a normal full backup, so it can also be
  downloaded from Drive and loaded with **Restore from backup**. Please don't
  edit, move to the bin, or rename it. If it is deleted, the next sync creates
  it again from the browser's copy.
- **Privacy:** the `drive.file` permission lets the app see **only** files it
  created, not the rest of the person's Drive. The browser talks to Google
  directly; there is no StaffAsia server in between. The page's Content
  Security Policy allows only `accounts.google.com/gsi` (sign-in) and
  `www.googleapis.com` (Drive).
- **Size limit:** sync uploads up to 5 MB. Logos are the usual cause of large
  data; the app warns if the limit is reached.

---

## Troubleshooting

| What you see | Fix |
|---|---|
| No "Google Drive sync" panel | `GOOGLE_CLIENT_ID` is empty in `js/config.js`, or the browser cached the old file. Reload with Ctrl+Shift+R. |
| Google says **Error 400: origin_mismatch** or **redirect_uri_mismatch** | Add the exact site address (scheme + host, e.g. `https://staffasia.github.io`) to **Authorized JavaScript origins** in step 4. Changes can take a few minutes to apply. |
| **Error 403: org_internal** / "access blocked" | The consent screen is **Internal** and the person used a non-staffasia.org account, or the other way round. |
| "The Google Drive API is not turned on…" | Step 2: enable the Google Drive API in the same project as the client ID. |
| "The Google sign-in window was blocked" | Allow pop-ups for the site and click again. |
| Chip stays on **Reconnect Drive** | Click it. The sign-in lasts about an hour, by Google's design. |

---

## For developers

| File | Role |
|---|---|
| `js/config.js` | Client ID and optional Workspace domain hint. |
| `js/cloud/google-auth.js` | Loads Google Identity Services and gets an access token (token model, `drive.file` only). The token is kept in localStorage until it expires. |
| `js/cloud/drive-api.js` | Finds, reads, creates and updates the sync file (Drive v3 REST, `fetch`). |
| `js/cloud/sync-merge.js` | Pure merge rules: newest invoice wins, deletions are remembered, three-way merge for lists. |
| `js/cloud/cloud-sync.js` | Orchestration: when to sync, applying changes to the editor, the panel and status chip, sign-in and sign-out. |
| `js/storage/local-storage.js` | Now tells listeners about every write (`onLocalWrite`), which is how sync notices changes. |
| `js/storage/invoice-library.js` | Deleting an invoice now records when (`invoiceStudio.deletedInvoices.v1`), so deletions sync. |

Tests: `npm test` (adds `tests/cloud-sync.test.mjs`) and
`python3 tests/e2e_drive_sync.py`. The second runs two browser profiles as two
devices against a stand-in for Google, so it needs no account or network.
