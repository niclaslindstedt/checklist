.PHONY: build test lint fmt fmt-check shellcheck actionlint changelog clean docs install bench icons icons-check store-preflight store-metadata tauri tauri-bundle tauri-clean tauri-fast tauri-fmt tauri-fmt-check tauri-install tauri-lint tauri-package tauri-package-debug tauri-test


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
	@files=$$(find . -name node_modules -prune -o -name '*.sh' -print); \
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

# ---------------------------------------------------------------------------
# SHIPPING TO THE STORE (native/store/)
# ---------------------------------------------------------------------------
# One authored listing compiles into the files the upload tools read. The
# RULES are committed; the WORDS are not — see native/store/README.md.

# "Is this checkout wired up to ship?" — every gate between here and a
# submission, what is missing and where to get it.
store-preflight:
	@node --experimental-strip-types --disable-warning=ExperimentalWarning \
		scripts/store-preflight.mjs $(ARGS)

# Compile the listing. `ARGS="--check"` validates without writing.
store-metadata:
	node --experimental-strip-types --disable-warning=ExperimentalWarning \
		scripts/generate-store-metadata.mjs $(ARGS)

# The desktop shell (tauri/) — a thin Tauri wrapper around this same app.
#
# It has its own toolchain, so `make test` and `make lint` deliberately stop at
# its edge and these targets are how it is reached instead;
# .github/workflows/desktop-tauri.yml runs the two check targets on every push
# that touches it, so a tree somebody forgot to check is a red PR rather than a
# surprise at release time. Needs a Rust toolchain (https://rustup.rs) plus the
# platform's webview development libraries — see tauri/README.md.

# --- running it ---

# Build the site into tauri/webroot/, compile the shell, and run it. This is
# the one to reach for; the first run compiles the Rust world and takes a few
# minutes, every one after it is seconds.
tauri:
	npm run tauri

# The same, but WITHOUT rebuilding the site — it re-copies whatever dist/
# already holds. Much quicker while iterating on the Rust, and wrong the moment
# you have touched the app, so reach for plain `make tauri` when in doubt.
tauri-fast:
	npm run tauri:fast

# The site, bundled into the shell, without launching anything.
tauri-bundle:
	npm run tauri:bundle

# The shell's own npm tooling (the Tauri CLI). `make tauri` needs none of it —
# only packaging does, and the packaging targets run this for you.
tauri-install:
	npm run tauri:install

# --- checking it ---

# The decision layer. Needs no GUI libraries at all — that is the whole reason
# tauri/shell/ is a separate crate from tauri/src-tauri/.
tauri-test:
	npm run tauri:test

# clippy at zero warnings, BOTH crates (this one does need the libraries).
tauri-lint:
	npm run tauri:lint

tauri-fmt:
	npm run tauri:fmt

tauri-fmt-check:
	npm run tauri:fmt:check

# --- packaging it ---

# The installers for THIS machine's platform, into tauri/target/release/bundle
# — a .exe on Windows, a .dmg on macOS, a .deb and an .AppImage on Linux. The
# release workflow runs exactly this on one runner per platform.
#
# Pass anything `tauri build` takes through ARGS, e.g. cross-compiling on a Mac:
#   make tauri-package ARGS="--target aarch64-apple-darwin"
tauri-package:
	npm run tauri:package -- $(ARGS)

# The same, built with the debug profile. Minutes faster than the release one
# (no LTO, no stripping) and the bundles are much bigger — for answering "does
# this still package on my machine" without waiting for a shipping build.
tauri-package-debug:
	npm run tauri:package:debug -- $(ARGS)

# `cargo clean` — the Rust target directory is gigabytes once it has built a
# release. The bundled webroot is left alone; every build replaces it wholesale.
tauri-clean:
	npm run tauri:clean
