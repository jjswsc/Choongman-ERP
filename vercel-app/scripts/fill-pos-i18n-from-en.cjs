const fs = require("fs")
const path = require("path")
const { spawnSync } = require("child_process")
const {
  posI18nPath,
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

const enSource = readPosI18nSource("en")
const enRange = getExportRange(enSource, LANG_TO_EXPORT.en)
if (!enRange) throw new Error("I18N_POS_EN block not found")
const enMap = parsePosKeyValues(enSource.slice(enRange.bodyStart, enRange.end))
const usedPosKeys = [...collectUsedPosKeys(root)].sort()

const edits = []

for (const lang of LANGS) {
  if (!targets.has(lang)) continue
  const source = readPosI18nSource(lang)
  const range = getExportRange(source, LANG_TO_EXPORT[lang])
  if (!range) continue
  const langMap = parsePosKeyValues(source.slice(range.bodyStart, range.end))
  const missing = usedPosKeys.filter((k) => !langMap.has(k) && enMap.has(k))
  if (!missing.length) continue

  const addLines = missing
    .map((k) => {
      const v = toSingleQuotedJsLiteral(enMap.get(k) || "")
      return `    ${k}: '${v}',`
    })
    .join("\n")

  const next = source.slice(0, range.insertAt) + "\n" + addLines + source.slice(range.insertAt)
  fs.writeFileSync(posI18nPath(lang), next, "utf8")
  edits.push({ lang, added: missing.length })
}

if (edits.length) {
  const v = spawnSync(process.execPath, [path.join(__dirname, "check-i18n-encoding.mjs")], {
    cwd: root,
    stdio: "inherit",
  })
  if (v.status !== 0) process.exit(v.status ?? 1)
}

for (const e of edits) {
  console.log(`${e.lang}: added ${e.added} keys`)
}
if (!edits.length) {
  console.log("no changes")
}
