---
type: Fixed
---

**The iOS app no longer closes at launch** — The wrapper subscribed to iCloud changes through a method the iCloud key-value module does not have, which threw as soon as the page mounted and closed the app. It now listens for the module's change event, so remote iCloud edits reach the list and the app opens.
