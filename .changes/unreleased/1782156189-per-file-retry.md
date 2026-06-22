---
type: Fixed
title: Resilient cloud loading on a flaky link
---

Reading or saving a cloud list now retries each individual file a few times when a request drops, so a single flaky download no longer fails the whole sync and strands you on the local copy when the connection is actually working.
