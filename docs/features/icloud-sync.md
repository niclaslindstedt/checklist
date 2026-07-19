# iCloud sync

In the **iOS app** you can keep your lists in step across your Apple devices through **iCloud** — with no account to make, nothing to sign into, and no server of ours in the middle. Open **Settings → Storage** and pick **iCloud**. That's the whole setup: it rides the Apple ID you're already signed into on the device, so there's no connect step, no password, and no OAuth screen. Add a list on your iPhone and it's there on your iPad; check something off on one and it ticks on the other.

This is the only sync option that asks for nothing. Google Drive and Dropbox both need you to sign in and grant access; iCloud uses Apple's own device-to-device sync, so your lists never pass through us and never need a cloud account you have to manage. It's offered only in the iOS app — the web version and the Android app don't show it, because there's no iCloud to reach there.

Because your lists live in a store the system syncs in the background, an edit made on another device flows in on its own — you don't have to pull to refresh, though you still can. The header cloud icon shows the same save status it does for the other sync backends, and tapping it opens the sync details if you ever want to see what's happening.

A couple of things worth knowing. iCloud syncs your **lists**; your appearance settings and your set of [namespaces](feature:namespaces) stay on each device rather than travelling with it, so if you keep several namespaces you'll set them up per device. And iCloud is Apple's key-value store rather than a folder of files, so unlike [Dropbox, Google Drive, or a local folder](feature:cloud-sync) there are no per-list markdown files to open — the trade for needing no account at all.
