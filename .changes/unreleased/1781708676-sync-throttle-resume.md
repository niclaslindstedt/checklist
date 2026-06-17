---
type: Fixed
title: Resilient cloud autosave
---

Cloud sync now waits out a backend rate limit and resumes on its own — and retries a transient network hiccup with exponential backoff — instead of getting stuck or flashing a sync error.
