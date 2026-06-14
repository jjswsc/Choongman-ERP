const path = require("path")
const { LANGS, collectUsedPosKeys, getPosDictKeysByLang } = require("./pos-i18n-file-utils.cjs")

const root = path.resolve(__dirname, "..")
const strict = process.argv.includes("--strict")

const usedList = [...collectUsedPosKeys(root)].sort()
const dictKeys = getPosDictKeysByLang()

console.log(`Used POS keys: ${usedList.length}`)
let totalMissing = 0
for (const lang of LANGS) {
  const missing = usedList.filter((k) => !dictKeys[lang].has(k))
  totalMissing += missing.length
  console.log(`\n[${lang}] missing: ${missing.length}`)
  if (missing.length) console.log(missing.join("\n"))
}

if (strict && totalMissing > 0) {
  process.exit(1)
}
