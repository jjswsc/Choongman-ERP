/**
 * Audit interior i18n: used keys, regional gaps, interior-admin pack gaps.
 * Run: node vercel-app/scripts/_check-interior-i18n.mjs
 */
import fs from "fs"

const i18nPath = "lib/i18n.ts"
const lines = fs.readFileSync(i18nPath, "utf8").split(/\r?\n/)

const langs = ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"]
const starts = {}
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^  (ko|en|th|mm|la|kh|vi|ms): \{/)
  if (m) starts[m[1]] = i
}
starts.end = lines.length

function keysInRange(start, end) {
  const set = new Set()
  for (let i = start + 1; i < end; i++) {
    const m = lines[i].match(/^    ([a-zA-Z][a-zA-Z0-9_]*):/)
    if (m) set.add(m[1])
  }
  return set
}

const ranges = {}
for (let i = 0; i < langs.length; i++) {
  const lang = langs[i]
  const next = langs[i + 1]
  ranges[lang] = [starts[lang], next ? starts[next] : starts.end]
}

const enInterior = [...keysInRange(...ranges.en)].filter((k) => k.startsWith("interior") || k.startsWith("helpSum_admin_interior") || k.startsWith("helpHow_admin_interior") || k === "adminInteriorProjects")
const adminKo = fs.readFileSync("lib/i18n-interior-admin.ts", "utf8")
const adminKeys = [...adminKo.matchAll(/^\s+(interior[A-Za-z0-9_]+|helpSum_admin_interior[A-Za-z0-9_]*|helpHow_admin_interior[A-Za-z0-9_]*):/gm)].map((m) => m[1])
const hasThPack = adminKo.includes("export const I18N_INTERIOR_ADMIN_TH")

console.log("=== Interior-admin pack keys ===", adminKeys.length, hasThPack ? "(TH pack present)" : "(TH pack missing)")
for (const lang of ["th", "mm", "la", "kh", "vi", "ms"]) {
  const keys = keysInRange(...ranges[lang])
  const missingAdmin = adminKeys.filter((k) => !keys.has(k))
  const note = lang === "th" && hasThPack ? " — runtime merge uses I18N_INTERIOR_ADMIN_TH" : " — runtime merge uses I18N_INTERIOR_ADMIN_EN"
  console.log(`${lang}: flat file missing ${missingAdmin.length} pack keys${note}`)

console.log("\n=== Main i18n interior keys (en) vs regional ===")
for (const lang of ["th", "mm", "la", "kh", "vi", "ms"]) {
  const keys = keysInRange(...ranges[lang])
  const missing = enInterior.filter((k) => !keys.has(k))
  console.log(`${lang}: missing ${missing.length} / ${enInterior.length} en interior keys`)
  if (missing.length > 0 && missing.length <= 30) {
    for (const k of missing) console.log("  -", k)
  } else if (missing.length > 30) {
    console.log("  first 15:", missing.slice(0, 15).join(", "))
  }
}

// Used keys from components
import path from "path"
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory() && e.name !== "node_modules") walk(p, acc)
    else if (/\.(tsx?|jsx?)$/.test(e.name)) acc.push(p)
  }
  return acc
}
const files = ["components/interior", "app/admin/interior"].flatMap((d) => (fs.existsSync(d) ? walk(d) : []))
const keyRe = /t\(["'](interior[A-Za-z0-9_]+)["']\)|tr\(t,\s*["'](interior[A-Za-z0-9_]+)["']|labelKey:\s*["'](interior[A-Za-z0-9_]+)["']|titleKey:\s*["'](interior[A-Za-z0-9_]+)["']/g
const used = new Set()
for (const f of files) {
  const s = fs.readFileSync(f, "utf8")
  let m
  while ((m = keyRe.exec(s))) used.add(m[1] || m[2] || m[3] || m[4])
}
used.delete(undefined)

const koKeys = keysInRange(...ranges.ko)
const missingUsedKo = [...used].filter((k) => !koKeys.has(k)).sort()
const missingUsedEn = [...used].filter((k) => !keysInRange(...ranges.en).has(k)).sort()
console.log("\n=== Used keys missing from ko ===", missingUsedKo.length)
for (const k of missingUsedKo) console.log("  -", k)
console.log("=== Used keys missing from en ===", missingUsedEn.length)
for (const k of missingUsedEn) console.log("  -", k)
