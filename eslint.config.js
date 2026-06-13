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
  {
    // The screenshot/preview endpoints are the ONLY API path for store media
    // and remain functional, but Apple marks them @deprecated in the spec (no
    // replacement has shipped — the newer multipart upload model covers
    // build/background-asset uploads only). The dependency on those deprecated
    // resources is deliberately confined to these two capability files (see
    // docs/phases/m6-media-workflows.md), so the no-deprecated rule is disabled
    // here and nowhere else; every layer above speaks in non-deprecated aliases.
    files: [
      "src/capabilities/app-screenshots.ts",
      "src/capabilities/app-previews.ts",
    ],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
    },
  },
  // Must stay last: disables every rule that would fight Prettier.
  prettier,
);
