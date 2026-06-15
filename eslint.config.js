import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";

export default [
  {
    // `.agent/skills/**` holds agent skill playbooks and their helper
    // scripts (e.g. the Playwright-based design `screenshot.mjs`). They
    // are optional tooling — not app source — and may import packages the
    // repo doesn't install, so they're out of scope for the app linter.
    ignores: ["dist/**", "node_modules/**", "dev-dist/**", ".agent/**"],
  },
  js.configs.recommended,
  {
    // Node tooling scripts (release / changelog automation). These run
    // under Node, so expose its globals rather than the browser's.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      ecmaVersion: 2022,
      globals: {
        process: "readonly",
        console: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts", "*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { sourceType: "module", ecmaVersion: 2022 },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      // TypeScript checks for undefined identifiers itself; the core rule only
      // produces false positives for DOM/Web globals (per typescript-eslint).
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // `src/domain/` is pure: no imports from ui/, storage/, the DOM, or fetch.
    // The DOM/fetch ban is enforced by `lib`-aware review plus the rule below;
    // the cross-module ban is enforced here.
    files: ["src/domain/**/*.ts"],
    plugins: { import: importPlugin },
    rules: {
      "import/no-restricted-paths": [
        "error",
        {
          zones: [
            {
              target: "src/domain",
              from: "src/ui",
              message: "domain/ must not import from ui/",
            },
            {
              target: "src/domain",
              from: "src/storage",
              message: "domain/ must not import from storage/",
            },
            {
              target: "src/domain",
              from: "src/app",
              message: "domain/ must not import from app/",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "window", message: "domain/ must not touch the DOM" },
        { name: "document", message: "domain/ must not touch the DOM" },
        { name: "fetch", message: "domain/ must not perform I/O" },
      ],
    },
  },
];
