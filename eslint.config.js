// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores(["dist/", "coverage/"]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Plain-JS files (this config itself) are not part of the TS project, so
    // type-aware rules cannot run on them.
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  // Must stay last: disables every rule that would fight Prettier.
  prettier,
);
