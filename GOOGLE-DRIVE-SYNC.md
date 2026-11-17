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

- **Sign in:** click the round account button at the top right to open
  **Settings**, then **Sign in with Google**. On the first sign-in, any
  invoices already in that browser go up to Drive.
- **New device:** open the website, sign in, and every invoice, client,
  template and brand appears. The latest invoice opens.
- **Automatic:** changes upload a few seconds after they are made. The app also
  syncs when it opens, when its tab is shown again, and every minute while it
  is open. The sync button in the top bar shows the state: **Synced**,
  **Saving to Drive**, **Offline**, **Renewing sign-in**, **Click to keep
  syncing** or **Sync is off**. Click it for details and **Sync now**.
- **Staying signed in:** without a server, a Google sign-in in the browser lasts
  about an hour and can only be renewed from a click. With **Settings > Stay
  signed in to Google** (on by default) the app renews it on your next click
  anywhere, a few minutes before it runs out; Google's window may flash for a
  moment. If that cannot happen (say the laptop was asleep), the button says
  **Click to keep syncing**: click it. The app keeps working and saving in the
  browser throughout, and waiting changes upload once renewed.
- **Sync automatically** can be turned off in Settings; then nothing uploads
  until **Sync now** is pressed.
- **Device name:** each browser has a name (Settings > Name of this device), so
  Settings can say where the last change from another device came from.
- **Both devices changed something:** for each invoice, the version changed
  most recently wins. Deleting an invoice deletes it on every device, unless it
  was edited somewhere after the deletion. For clients, templates and brands,
  a change made on one device replaces the list on the others. If both changed
  it, the two lists are combined.
- **Shared or borrowed computer:** in Settings, **Remove from this browser**
  (or **Sign out**, then **Remove from this browser**). Everything stays safe
  in Drive.
- **Where the data is:** one folder in the person's **own** My Drive:

  ```
  SA Invoice Generator/
    SA Invoice Generator - sync.json   kept up to date by sync
    Backups/
      2026-11-17 Backup.json           dated backups
  ```

  Each person has their own data; nothing is shared between colleagues. From
  2.14.0 a sync file already in the root of My Drive is moved into the folder
  on the next sync. Please don't edit, move to the bin, or rename the sync
  file. If it is deleted, the next sync creates it again from the browser's
  copy.
- **Backups:** a dated backup is saved in **Backups** on the first sync of each
  day (Settings > Back up automatically: every day, every week or off), and
  with **Back up now**. Old ones are tidied away: every backup from the latest
  day, one a day for 30 days, and one a month for a year (or keep every
  backup). Settings lists the recent ones with **Restore**, which adds back
  anything missing and never deletes newer work. Any backup, or the sync file
  itself, can also be downloaded from Drive and loaded with **Restore from a
  file**. The app can only see files it made, so a backup moved into the
  folder by hand does not show in its list; use Restore from a file for that.
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
| Settings says sync is not set up | `GOOGLE_CLIENT_ID` is empty in `js/config.js`, or the browser cached the old file. Reload with Ctrl+Shift+R. |
| Google says **Error 400: origin_mismatch** or **redirect_uri_mismatch** | Add the exact site address (scheme + host, e.g. `https://staffasia.github.io`) to **Authorized JavaScript origins** in step 4. Changes can take a few minutes to apply. |
| **Error 403: org_internal** / "access blocked" | The consent screen is **Internal** and the person used a non-staffasia.org account, or the other way round. |
| "The Google Drive API is not turned on…" | Step 2: enable the Google Drive API in the same project as the client ID. |
| "The Google sign-in window was blocked" | Allow pop-ups for the site and click again. |
| The sync button says **Click to keep syncing** | Click it. The sign-in lasts about an hour, by Google's design; with Stay signed in it is renewed on your next click. |

---

## For developers

| File | Role |
|---|---|
| `js/config.js` | Client ID and optional Workspace domain hint. |
| `js/cloud/google-auth.js` | Loads Google Identity Services and gets an access token (token model, `drive.file` only). The token is kept in localStorage until it expires. |
| `js/cloud/drive-api.js` | Finds, reads, creates, updates, moves and deletes the app's files and folders (Drive v3 REST, `fetch`). |
| `js/cloud/drive-backups.js` | The app's folder, the Backups folder, and dated backups in it. |
| `js/cloud/backup-retention.js` | Pure rules: when a backup is due, and which backups to keep. |
| `js/cloud/sync-merge.js` | Pure merge rules: newest invoice wins, deletions are remembered, three-way merge for lists. |
| `js/cloud/cloud-sync.js` | Orchestration: when to sync, renewing the sign-in on a click, applying changes to the editor, Settings and the sync button, backups, sign-in and sign-out. |
| `js/settings-store.js` | This browser's settings (sync, backups, device name, invoice defaults). |
| `js/storage/local-storage.js` | Now tells listeners about every write (`onLocalWrite`), which is how sync notices changes. |
| `js/storage/invoice-library.js` | Deleting an invoice now records when (`invoiceStudio.deletedInvoices.v1`), so deletions sync. |

Tests: `npm test` (`tests/cloud-sync.test.mjs`, `tests/quarters.test.mjs`) and
`python3 tests/e2e_drive_sync.py`. The second runs two browser profiles as two
devices against a stand-in for Google, so it needs no account or network.
