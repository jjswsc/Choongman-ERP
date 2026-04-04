import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/** Next/React Compiler가 추가한 엄격 규칙 — 기존 코드베이스와 호환을 위해 비활성화 */
const reactHooksCompilerRulesOff = {
  "react-hooks/set-state-in-effect": "off",
  "react-hooks/preserve-manual-memoization": "off",
  "react-hooks/immutability": "off",
  "react-hooks/purity": "off",
  "react-hooks/refs": "off",
  "react-hooks/use-memo": "off",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // CommonJS 유틸; no-require-imports 예외 대신 디렉터리 제외
    "scripts/**",
    // Capacitor/Electron 로컬 빌드·의존성 — 린트 대상 아님(느리고 BABEL 경고 유발)
    "android/**",
    "windows-pos/node_modules/**",
    "windows-erp/node_modules/**",
    // Electron 진입점(CommonJS require) — Next/TS 린트 규칙과 맞지 않음
    "windows-pos/**",
    "windows-erp/**",
    // 빌드 산출·병합 스크립트 결과
    "public/sw.js",
    "public/swe-worker*.js",
  ]),
  {
    files: ["tailwind.config.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    files: [
      "**/*.ts",
      "**/*.tsx",
      "**/*.js",
      "**/*.jsx",
      "**/*.mjs",
      "**/*.cjs",
    ],
    rules: reactHooksCompilerRulesOff,
  },
]);

export default eslintConfig;
