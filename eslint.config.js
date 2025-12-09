import js from "@eslint/js";
import globals from "globals";

export default [
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": "warn",
      "no-console": "off",
      "no-undef": "warn"
    }
  },
  {
    // Special config for test files
    files: ["**/*.test.js", "**/__tests__/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest
      }
    }
  },
  {
    // Ignore certain files/folders
    ignores: [
      "node_modules/**",
      "dist/**",
      "build/**",
      "coverage/**"
    ]
  }
];