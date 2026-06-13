/**
 * i18n.ts UTF-8 / ??? 손상 조기 감지 (CI·build:prep)
 * Run: node scripts/check-i18n-encoding.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { assertI18nEncodingOk } from "./lib/i18n-encoding-guard.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const i18nPath = path.join(__dirname, "../lib/i18n.ts")
const src = fs.readFileSync(i18nPath, "utf8")

const result = assertI18nEncodingOk(src)
if (!result.ok) {
  console.error("i18n encoding check FAILED:")
  for (const e of result.errors) console.error(`  - ${e}`)
  console.error("\nIf ko/th show ???, restore from git before ab72441c and re-apply satellite merges.")
  process.exit(1)
}

console.log("i18n encoding check OK")
