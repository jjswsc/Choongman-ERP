/**
 * i18n-marketing-hub → i18n.ts useT 병합. Run: node scripts/patch-marketing-i18n-merge.mjs
 */
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { writeI18nFileSync } from "./lib/i18n-encoding-guard.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const filePath = path.join(__dirname, "../lib/i18n.ts")

let s = fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n")

function patch(oldStr, newStr, label) {
  if (!s.includes(oldStr)) {
    console.error(`MISSING anchor [${label}]`)
    process.exitCode = 1
    return
  }
  s = s.replace(oldStr, newStr)
  console.log(`OK [${label}]`)
}

const importAnchor = `} from "./i18n-store-admin"

export const i18n = {`

const importNew = `} from "./i18n-store-admin"
import {
  I18N_MARKETING_HUB_EN,
  I18N_MARKETING_HUB_KH,
  I18N_MARKETING_HUB_KO,
  I18N_MARKETING_HUB_LA,
  I18N_MARKETING_HUB_MM,
  I18N_MARKETING_HUB_MS,
  I18N_MARKETING_HUB_TH,
  I18N_MARKETING_HUB_VI,
} from "./i18n-marketing-hub"

export const i18n = {`

patch(importAnchor, importNew, "import-marketing-hub")

const hubByLang = `
const MARKETING_HUB_BY_LANG: Record<string, Record<string, string>> = {
  ko: I18N_MARKETING_HUB_KO,
  en: I18N_MARKETING_HUB_EN,
  th: I18N_MARKETING_HUB_TH,
  mm: I18N_MARKETING_HUB_MM,
  la: I18N_MARKETING_HUB_LA,
  kh: I18N_MARKETING_HUB_KH,
  vi: I18N_MARKETING_HUB_VI,
  ms: I18N_MARKETING_HUB_MS,
}
`

if (!s.includes("MARKETING_HUB_BY_LANG")) {
  patch(
    "const STORE_ADMIN_BY_LANG: Record<string, Record<string, string>> = {",
    hubByLang + "\nconst STORE_ADMIN_BY_LANG: Record<string, Record<string, string>> = {",
    "marketing-hub-by-lang"
  )
}

patch(
  "    const storeAdminPack = STORE_ADMIN_BY_LANG[lang] ?? I18N_STORE_ADMIN_EN\n    const merged = { ...base, ...accountingPack, ...interiorPack, ...storeAdminPack }",
  "    const storeAdminPack = STORE_ADMIN_BY_LANG[lang] ?? I18N_STORE_ADMIN_EN\n    const marketingHubPack = MARKETING_HUB_BY_LANG[lang] ?? I18N_MARKETING_HUB_EN\n    const merged = { ...base, ...accountingPack, ...interiorPack, ...storeAdminPack, ...marketingHubPack }",
  "merge-marketing-hub-useT"
)

if (!process.exitCode) {
  writeI18nFileSync(filePath, s)
  console.log("Done.")
}
