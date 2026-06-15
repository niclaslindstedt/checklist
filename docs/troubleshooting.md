# Troubleshooting

## "My checklists vanished"

- **Symptom:** Opening the app shows no templates or checklists, even
  though you had some yesterday.
- **Cause:** The browser cleared site data. Private/incognito modes,
  aggressive "Clear cookies on exit" settings, and iOS Safari's
  7-day-inactive purge will all wipe `localStorage`.
- **Fix:** If you had a sync backend configured, reconnect to it from
  **Settings → Storage**; data restores automatically. Otherwise the
  data is gone — there is no server copy by design.
- **Prevention:** Enable Google Drive or Dropbox sync, or **Install**
  the app as a PWA (installed PWAs are usually treated as persistent
  by browsers).

## "QuotaExceededError" when saving

- **Symptom:** A red banner appears saying the save failed.
- **Cause:** `localStorage` has hit the per-origin quota (typically
  5 MB). This is unusual for text-only checklists but can happen if
  you have hundreds of templates with very long notes.
- **Fix:** Export and import a smaller subset, or switch to a cloud
  backend (which stores in IndexedDB locally with a much larger
  quota).

## Google Drive / Dropbox login window is blocked

- **Symptom:** Clicking **Connect Drive** does nothing.
- **Cause:** A popup blocker rejected the OAuth window because the
  click was not direct (e.g. you used a keyboard shortcut).
- **Fix:** Click the button directly with the mouse, or whitelist the
  app's origin in your popup-blocker settings.

## Service worker won't update

- **Symptom:** You see an old version of the app even after a release.
- **Cause:** The service worker is still serving the previous build
  while the new one waits to activate.
- **Fix:** Close all open tabs of the app and reopen one. The new
  worker will activate. On desktop you can also visit
  `chrome://serviceworker-internals/` (or the equivalent in your
  browser) and **Unregister**.

## Shared link is too long

- **Symptom:** Pasting the share URL into a chat app gets cut off.
- **Cause:** Some clients truncate URLs over ~2000 characters. The
  share encoder gzips the payload, but a large checklist can still
  exceed that limit.
- **Fix:** Use **Export → JSON** instead and attach the file.
