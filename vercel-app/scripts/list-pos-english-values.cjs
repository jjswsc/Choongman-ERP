const fs = require("fs")
const path = require("path")

const i18nPath = path.resolve(__dirname, "..", "lib", "i18n.ts")
const src = fs.readFileSync(i18nPath, "utf8")
const langs = ["vi", "ms", "kh"]

function getBlock(lang) {
  const startRe = new RegExp(`\\n\\s*${lang}:\\s*\\{`)
  const m = startRe.exec(src)
  if (!m || m.index == null) return ""
  const start = m.index + m[0].length
  const end = src.indexOf("\n  } as Record<string, string>,", start)
  if (end < 0) return ""
  return src.slice(start, end)
}

function isLikelyEnglish(v) {
  if (!v) return false
  // mostly ascii letters/symbols and contains latin letters
  const asciiOnly = /^[\x00-\x7F]+$/.test(v)
  const hasLetter = /[A-Za-z]/.test(v)
  return asciiOnly && hasLetter
}

for (const lang of langs) {
  const block = getBlock(lang)
  const re = /\n\s*(pos[A-Za-z0-9_]+):\s*'((?:\\'|[^'])*)',/g
  const rows = []
  let m
  while ((m = re.exec(block))) {
    const key = m[1]
    const val = m[2]
    if (isLikelyEnglish(val)) rows.push({ key, val })
  }
  console.log(`\n[${lang}] english-like pos values: ${rows.length}`)
  rows.slice(0, 200).forEach((r) => console.log(`${r.key} = ${r.val}`))
}
