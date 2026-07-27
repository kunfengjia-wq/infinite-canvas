import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// ESLint 扁平配置（Vite React-TS 标准范式）
// 职责边界：ESLint 只负责代码正确性（未使用变量、Hooks 规则等），
// 格式化（缩进/引号/分号）交由 Prettier 处理，二者互补。
export default tseslint.config(
    { ignores: ["dist", "node_modules", "public", "*.config.ts", "*.config.js"] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
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
            ...reactHooks.configs.recommended.rules,
            // —— React Hooks v7 推荐集包含大量激进规则（set-state-in-effect/refs/immutability 等），
            //    会标记大量可正常运行的惯用写法。故仅保留 rules-of-hooks（真实 bug）为 error，
            //    其余降级为 warn：保持可见但不阻断构建，避免改动已验证可运行的代码。——
            "react-hooks/exhaustive-deps": "warn",
            "react-hooks/set-state-in-effect": "warn",
            "react-hooks/refs": "warn",
            "react-hooks/immutability": "warn",
            "react-hooks/use-memo": "warn",
            "react-hooks/preserve-manual-memoization": "warn",
            // —— TypeScript 风格类规则降级为 warn，_ 前缀的有意未用变量/参数不计 ——
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
            "@typescript-eslint/no-unused-expressions": "warn",
            "@typescript-eslint/no-empty-object-type": "warn",
            "@typescript-eslint/no-explicit-any": "warn",
            "preserve-caught-error": "warn",
            "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
        },
    },
);
