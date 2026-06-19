import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";
import importPlugin from "eslint-plugin-import";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";

export default [
  {
    // `.agent/skills/**` holds agent skill playbooks and their helper
    // scripts (e.g. the Playwright-based design `screenshot.mjs`). They
    // are optional tooling — not app source — and may import packages the
    // repo doesn't install, so they're out of scope for the app linter.
    //
    // `native/**` is the React Native app: a separate Expo project with its
    // own toolchain (Metro, babel-preset-expo) and its own dependency tree
    // that this repo's root install doesn't provide. It shares the platform-
    // agnostic core under `src/` but is linted by its own setup, so it is out
    // of scope for the web app's linter here.
    ignores: [
      "dist/**",
      "node_modules/**",
      "dev-dist/**",
      ".agent/**",
      "native/**",
    ],
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
        Buffer: "readonly",
      },
    },
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}", "*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: 2022,
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser },
    },
    plugins: {
      "@typescript-eslint": tseslint,
      import: importPlugin,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "jsx-a11y": jsxA11y,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // TypeScript checks for undefined identifiers itself; the core rule only
      // produces false positives for DOM/Web globals (per typescript-eslint).
      "no-undef": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],
      // eslint-plugin-react-hooks 7 grew its `recommended` preset with new
      // rules that fire on deliberate, working patterns already in the tree
      // (synchronous setState in cleanup-style effects, refs touched in test
      // harness render). Keeping the prior lint surface across the bump;
      // adopting these is a separate, deliberate refactor.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
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
