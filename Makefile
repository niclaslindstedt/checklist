.PHONY: build test lint fmt fmt-check shellcheck actionlint changelog clean docs install bench icons icons-check


build:
	npm run build

test:
	npm test

lint:
	npm run lint

fmt:
	npm run fmt

fmt-check:
	npm run fmt:check

# Local preview of what the Release workflow will write to CHANGELOG.md.
# Pass the planned version: `make changelog VERSION=0.2.0`. Consumes the
# fragments in .changes/unreleased/ — run inside a scratch branch or
# revert afterwards if you only wanted a preview.
changelog:
	@test -n "$(VERSION)" || { \
		echo "usage: make changelog VERSION=X.Y.Z"; exit 2; \
	}
	node scripts/release/collate-changelog.mjs $(VERSION)

clean:
	rm -rf dist node_modules

install:
	npm install


# shellcheck every shell script the repo still ships. The fragment-based
# release pipeline is pure Node, so there may be no `.sh` files at all —
# tolerate that instead of failing on an unexpanded glob.
shellcheck:
	@files=$$(find . -path ./node_modules -prune -o -name '*.sh' -print); \
	if [ -n "$$files" ]; then shellcheck $$files; else echo "no shell scripts to check"; fi

actionlint:
	actionlint -color

# Regenerate the PWA icon set in public/ from public/favicon.svg.
# See pwa-assets.config.ts for the preset overrides.
icons:
	npm run icons

# CI drift guard: regenerate the icons and fail if any committed PNG
# (or favicon.ico) differs from public/favicon.svg. Catches an edited
# favicon.svg that was committed without rerunning `make icons`.
icons-check:
	@tmp=$$(mktemp -d) && trap 'rm -rf "$$tmp"' EXIT && \
	  cp public/pwa-64x64.png public/pwa-192x192.png \
	     public/pwa-512x512.png public/maskable-icon-512x512.png \
	     public/apple-touch-icon-180x180.png public/favicon.ico \
	     "$$tmp/" && \
	  npm run icons >/dev/null && \
	  for f in pwa-64x64.png pwa-192x192.png pwa-512x512.png \
	           maskable-icon-512x512.png apple-touch-icon-180x180.png \
	           favicon.ico; do \
	    cmp -s "$$tmp/$$f" "public/$$f" || \
	      { echo "icons drift: $$f differs — run 'make icons' and commit"; \
	        cp "$$tmp/$$f" "public/$$f"; exit 1; }; \
	  done

docs:
	@echo "see docs/"