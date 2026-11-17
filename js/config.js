/**
 * Site settings for Google sign-in and Google Drive sync.
 *
 * GOOGLE_CLIENT_ID: the OAuth 2.0 "Web application" client ID from Google
 * Cloud Console (APIs & Services -> Credentials). It is public by design: it
 * identifies the app, it is not a password. Leave it empty to turn Google
 * Drive sync off; the app then works exactly as before, on this device only.
 *
 * See GOOGLE-DRIVE-SYNC.md for the one-time setup.
 */
export const GOOGLE_CLIENT_ID = "355317253211-r9uekdegqe8gb47sbrs7oha1ac7qomh2.apps.googleusercontent.com";

/**
 * Optional: a Google Workspace domain (for example "staffasia.org"). When set,
 * the Google account chooser offers accounts from that domain first. It is a
 * hint only; who may sign in is decided in Google Cloud Console (an "Internal"
 * consent screen allows only accounts from your organisation).
 */
export const GOOGLE_HOSTED_DOMAIN = "staffasia.org";