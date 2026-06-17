# Cloud sync

`checklist` runs entirely in your browser and has no server of its own — so when you sync, your lists go to **your** cloud, not ours. Open **Settings → Storage** and pick **Google Drive** or **Dropbox**, sign in, and the app keeps your lists in that account from then on, ready to pick up on your next device.

You can lock your lists down at the same time. Turn on **encryption** with a passphrase and your lists are scrambled (AES-GCM) before they ever leave the device. The passphrase itself never leaves your device and is never stored anywhere — there is no recovery, so if you forget it the data can't be read. After a reload the app asks you to re-enter it before showing your lists. Your appearance and list settings stay readable either way, so the unlock screen still wears your theme — see [local folder](feature:local-folder) for where those live.

Because two devices can edit the same list at once, the app watches for collisions. When one happens, a **conflict** dialog asks which copy to keep; nothing is merged behind your back.

## How it works

1. Go to **Settings → Storage** and choose **Google Drive** or **Dropbox**. Sign in through the provider's own screen.
2. Optionally turn on **encryption** and set a passphrase — your lists are encrypted on your device before being uploaded.
3. Watch the **cloud icon** in the header: it shows when you're synced, when a save is in flight, and when something needs your attention.
4. Tap that icon to open a **sync details** dialog. It spells out what the sync is doing, and when a save fails it shows the exact reason — with buttons to **reconnect** or **try again** without leaving your list.
5. When two devices clash, pick the copy to keep in the conflict dialog.

On the iOS app you can instead store your lists in **iCloud**, keeping them in step across your Apple devices — choose it under **Storage** in the list menu. To keep lists in separate buckets that sync independently, see [namespaces](feature:namespaces).
