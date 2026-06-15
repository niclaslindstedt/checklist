.PHONY: build test lint fmt fmt-check shellcheck actionlint release clean docs website website-dev install bench


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

release:
	npm run build

clean:
	rm -rf dist node_modules

install:
	npm install


shellcheck:
	shellcheck scripts/*.sh

actionlint:
	actionlint -color

docs:
	@echo "see docs/"

website:
	cd website && npm install && npm run build

website-dev:
	cd website && npm install && npm run dev