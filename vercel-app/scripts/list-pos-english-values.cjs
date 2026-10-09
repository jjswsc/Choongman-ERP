const fs = require("fs")
const path = require("path")

const localesDir = path.resolve(__dirname, "..", "lib", "i18n-locales")
const langs = ["vi", "ms", "kh"]

function getBlock(lang) {
  return fs.readFileSync(path.join(localesDir, `${lang}.ts`), "utf8")
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
