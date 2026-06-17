# Local folder

Instead of keeping your lists locked inside the browser, you can save them to a real **folder on your device**. Open **Settings → Storage**, choose **Local folder**, and pick a directory. From then on each of your checklists is written there as its own **`.md` markdown file** — plain `- [ ]` / `- [x]` task lines with the list name as the heading — so you can open, edit, search, diff, or back them up with any tool you like, then see the changes reflected back in the app.

This same per-list markdown layout is what [cloud sync](feature:cloud-sync) uses too: **Dropbox** and **Google Drive** store one markdown file per list, exactly like a local folder. Only the default **This device** option keeps everything in a single bundled document instead of separate files.

Your appearance and list settings ride along as well. They aren't part of any one checklist, so they're saved to a single **`settings.json`** file at the root of your folder — beside the per-namespace folders — and picked up automatically on every device that opens the same folder. That's why your theme and preferences follow you wherever you sync.

## How it works

1. In **Settings → Storage**, choose **Local folder** and pick a directory on your device. (This option appears in browsers that support folder access.)
2. Each checklist becomes a `.md` file in that folder — readable and editable in any text editor.
3. Edit a file with another tool, and the app reflects your changes; the app's edits write straight back to the files.
4. Your appearance and list settings live in `settings.json` at the folder root, so they travel with the folder.

If you grouped your lists into separate folders, see [namespaces](feature:namespaces) — each one is its own subfolder, so you can share or sync just one.
