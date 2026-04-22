import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const utilityEnforcementRules = {
  "no-restricted-syntax": [
    "warn",
    {
      selector:
        "CallExpression[callee.object.property.name='clipboard'][callee.property.name='writeText']",
      message:
        "Use copyToClipboard() from @/lib/utils instead of navigator.clipboard.writeText. The utility handles non-HTTPS contexts and older browsers via a textarea+execCommand fallback.",
    },
  ],
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/utils.ts"],
    rules: utilityEnforcementRules,
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
