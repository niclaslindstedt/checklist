---
type: Fixed
title: Resilient cloud autosave
---

Cloud sync now waits out a backend rate limit and resumes on its own, retries a transient network hiccup with exponential backoff, and — when a save does fail outright — re-pushes it when you hit Try again, instead of getting stuck or flashing a sync error.
