.PHONY: build test lint fmt fmt-check shellcheck actionlint changelog clean docs install bench


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

docs:
	@echo "see docs/"