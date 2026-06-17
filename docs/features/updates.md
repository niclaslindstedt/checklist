# Staying up to date

`checklist` is a Progressive Web App, so it can run offline and update
itself in the background. When a new version has been deployed, you do not
have to hunt for it — the app notices and brings it down for you, then
hands you the choice of when to switch over.

## How it works

1. The app checks for a freshly deployed version while you use it.
2. As the new version downloads, the **title in the header fills with
   colour from the bottom up** — a quiet progress bar that tells you an
   update is on its way.
3. Once it is ready, a prompt appears **naming the version you are
   upgrading to**, with a **Reload** button and a **Dismiss** button.
4. Reload when it suits you and the new version takes over. Dismiss to keep
   working and apply it later — your place is never yanked out from under
   you.

Because the update is staged and only applied on your tap, you upgrade at
a moment of your choosing rather than mid-task.

## Pull to refresh

On touch devices there is a second, separate gesture: **pull down from the
top of the list** and `checklist` reloads your list from storage. A small
pill slides down from the top edge to track the pull and confirm the
refresh.

This is most useful when you sync across devices — see
[Cloud sync](feature:cloud-sync) and [Local folder](feature:local-folder).
Pulling to refresh re-reads the stored copy, so an edit you made on another
device shows up here. (This is about your data, not the app version; the
download-fill above is what tells you a new build has arrived.)
