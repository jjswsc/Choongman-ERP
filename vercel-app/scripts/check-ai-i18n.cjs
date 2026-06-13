const fs = require("fs")
const path = require("path")

const i18nPath = path.join(__dirname, "../lib/i18n.ts")
const src = fs.readFileSync(i18nPath, "utf8")
const langs = ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"]

const files = [
  "components/ai/ai-center-client.tsx",
  "components/ai/ai-center-drawer.tsx",
  "components/ai/ai-center-action-form.tsx",
  "components/ai/ai-center-shared.tsx",
]

const used = new Set(["helpSum_admin_ai_center", "helpHow_admin_ai_center"])
for (const f of files) {
  const c = fs.readFileSync(path.join(__dirname, "..", f), "utf8")
  for (const m of c.matchAll(/t\(["'](aiCenter[a-zA-Z0-9_]+)["']/g)) used.add(m[1])
}

function extractBlock(lang) {
  const marker = `\n  ${lang}: {`
  const start = src.indexOf(marker)
  if (start < 0) return ""
  let i = src.indexOf("{", start)
  let depth = 0
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++
    else if (src[i] === "}") {
      depth--
      if (depth === 0) return src.slice(src.indexOf("{", start), i + 1)
    }
  }
  return ""
}

const blocks = {}
for (const lang of langs) {
  const block = extractBlock(lang)
  const keys = new Set()
  for (const m of block.matchAll(/^\s+(aiCenter[a-zA-Z0-9_]+|helpSum_admin_ai_center|helpHow_admin_ai_center):/gm)) {
    keys.add(m[1])
  }
  blocks[lang] = keys
}

const koKeys = [...blocks.ko].filter((k) => k.startsWith("aiCenter") || k.startsWith("help"))
console.log("ko aiCenter+help keys:", koKeys.length)
for (const lang of langs) {
  const missing = koKeys.filter((k) => !blocks[lang].has(k)).sort()
  const extra = [...blocks[lang]].filter((k) => k.startsWith("aiCenter") && !blocks.ko.has(k)).sort()
  console.log(`\n=== ${lang} missing vs ko (${missing.length}) ===`)
  console.log(missing.join("\n") || "(none)")
  if (extra.length) console.log(`extra: ${extra.join(", ")}`)
}

const usedMissing = {}
for (const lang of langs) {
  usedMissing[lang] = [...used].filter((k) => !blocks[lang].has(k)).sort()
  console.log(`\n=== ${lang} missing vs USED (${usedMissing[lang].length}) ===`)
  console.log(usedMissing[lang].join("\n") || "(none)")
}
