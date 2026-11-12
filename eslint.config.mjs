import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig([{
    ignores: ["coverage/**", "playwright-report/**", "test-results/**"],
}, {
    extends: [...nextCoreWebVitals],
    rules: {
        // New React-Compiler rules shipped with eslint-config-next 16. They flag
        // established patterns here (hydration-safe setState in an effect, icon
        // lookups from a registry, a countdown from Date.now). Warn, don't fail,
        // until each is reviewed on its own.
        "react-hooks/set-state-in-effect": "warn",
        "react-hooks/static-components": "warn",
        "react-hooks/purity": "warn",
    },
}, {
    // Playwright fixtures name their callback `use`; it is not a React hook.
    files: ["tests/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
}, {
    files: ["src/**/*.{ts,tsx,js,jsx}"],

    rules: {
        "no-restricted-imports": ["error", {
            patterns: [{
                group: ["**/tests/**", "tests/**", "@/../tests/**"],
                message: "App code must not import test tooling (tests/e2e holds a service-role client). See docs/ui-testing.md.",
            }],
        }],
    },
}]);