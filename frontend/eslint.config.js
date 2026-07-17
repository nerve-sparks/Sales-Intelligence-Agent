import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["dist"] },
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // tseslint.configs.recommended (above) already turns these off in favor
      // of the TS-aware versions - js.configs.recommended.rules re-enables
      // them for .ts/.tsx since flat config merges by file match, not by
      // array position alone. Keep them off here or TS-only syntax (type-only
      // arrow param names, ambient DOM types) gets flagged as plain-JS errors.
      "no-unused-vars": "off",
      "no-undef": "off",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true }
      ],
    },
  },
];
