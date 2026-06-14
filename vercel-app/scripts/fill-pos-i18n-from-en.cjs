const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")
const {
  POS_I18N_PATH,
  LANGS,
  LANG_TO_EXPORT,
  readPosI18nSource,
  getExportRange,
  parsePosKeyValues,
  toSingleQuotedJsLiteral,
  collectUsedPosKeys,
} = require("./pos-i18n-file-utils.cjs")

const root = path.resolve(__dirname, "..")
const targetLangsArg = process.env.TARGET_LANGS
const defaultTargets = LANGS.filter((l) => l !== "en")
const targets = new Set(
  (targetLangsArg ? targetLangsArg.split(",").map((s) => s.trim()).filter(Boolean) : defaultTargets).filter(
    (l) => l !== "en"
  )
)

let source = readPosI18nSource()
const enRange = getExportRange(source, LANG_TO_EXPORT.en)
if (!enRange) throw new Error("I18N_POS_EN block not found")
const enBlock = source.slice(enRange.bodyStart, enRange.end)
const enMap = parsePosKeyValues(enBlock)
const usedPosKeys = [...collectUsedPosKeys(root)].sort()

let next = source
const edits = []

for (const lang of LANGS) {
  if (!targets.has(lang)) continue
  const range = getExportRange(next, LANG_TO_EXPORT[lang])
  if (!range) continue
  const block = next.slice(range.bodyStart, range.end)
  const langMap = parsePosKeyValues(block)
  const missing = usedPosKeys.filter((k) => !langMap.has(k) && enMap.has(k))
  if (!missing.length) continue

  const addLines = missing
    .map((k) => {
      const v = toSingleQuotedJsLiteral(enMap.get(k) || "")
      return `    ${k}: '${v}',`
    })
    .join("\n")

  next = next.slice(0, range.insertAt) + "\n" + addLines + next.slice(range.insertAt)
  edits.push({ lang, added: missing.length })
}

if (edits.length) {
  fs.writeFileSync(POS_I18N_PATH, next, "utf8")
  const v = spawnSync(process.execPath, [path.join(__dirname, "check-i18n-encoding.mjs")], {
    cwd: root,
    stdio: "inherit",
  })
  if (v.status !== 0) process.exit(v.status ?? 1)
}

for (const e of edits.reverse()) {
  console.log(`${e.lang}: added ${e.added} keys`)
}
if (!edits.length) {
  console.log("no changes")
}
