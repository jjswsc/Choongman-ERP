/**
 * i18n UTF-8 / ??? 손상 조기 감지 (CI·build:prep)
 * 대상: lib/i18n.ts, lib/i18n-locales/*.ts, lib/i18n-pos-locales/*.ts
 * Run: node scripts/check-i18n-encoding.mjs
 */
import path from "path"
import { fileURLToPath } from "url"
import { assertI18nEncodingOk, readI18nSources } from "./lib/i18n-encoding-guard.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const libDir = path.join(__dirname, "../lib")

const result = assertI18nEncodingOk(readI18nSources(libDir))
if (!result.ok) {
  console.error("i18n encoding check FAILED:")
  for (const e of result.errors) console.error(`  - ${e}`)
  console.error("\nIf ko/th/mm show ???, restore the damaged locale file from git (lib/i18n-locales/<lang>.ts).")
  process.exit(1)
}

console.log("i18n encoding check OK")
