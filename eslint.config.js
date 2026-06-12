// @ts-check
import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  // src/generated/ holds machine-written boundary artifacts; type-aware rules
  // would spend minutes on a six-digit-line type file and can never find a
  // human mistake there.
  globalIgnores(["dist/", "coverage/", "src/generated/"]),
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
    // Plain-JS files (this config itself, scripts/) are not part of the TS
    // project, so type-aware rules cannot run on them and Node globals have
    // to be declared instead of inferred from @types/node.
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: globals.node,
    },
  },
  // Must stay last: disables every rule that would fight Prettier.
  prettier,
);
