import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Rule overrides. React 19's `react-hooks/set-state-in-effect` is too
  // aggressive for legitimate state-transition tracking patterns (e.g. the
  // SessionExpiryGuard observing useSession() status, or modals syncing form
  // state to prop changes). Demote to warn so it doesn't fail CI.
  {
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
