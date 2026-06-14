const fs = require("fs")
const path = require("path")

const POS_I18N_PATH = path.resolve(__dirname, "..", "lib", "i18n-pos.ts")

const LANGS = ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"]

const LANG_TO_EXPORT = {
  ko: "I18N_POS_KO",
  en: "I18N_POS_EN",
  th: "I18N_POS_TH",
  mm: "I18N_POS_MM",
  la: "I18N_POS_LA",
  kh: "I18N_POS_KH",
  vi: "I18N_POS_VI",
  ms: "I18N_POS_MS",
}

const EXPORT_ORDER = LANGS.map((lang) => LANG_TO_EXPORT[lang])

function readPosI18nSource() {
  return fs.readFileSync(POS_I18N_PATH, "utf8")
}

function getExportRange(source, exportName) {
  const startRe = new RegExp(`export const ${exportName}(?:[^=]|\\n)*= \\{`)
  const m = startRe.exec(source)
  if (!m || m.index == null) return null
  const bodyStart = m.index + m[0].length
  let end = source.length
  const idx = EXPORT_ORDER.indexOf(exportName)
  for (let i = idx + 1; i < EXPORT_ORDER.length; i++) {
    const nextRe = new RegExp(`\\nexport const ${EXPORT_ORDER[i]}(?:[^=]|\\n)*= \\{`)
    const nm = nextRe.exec(source.slice(bodyStart))
    if (nm && nm.index != null) {
      end = bodyStart + nm.index
      break
    }
  }
  const body = source.slice(bodyStart, end)
  const closeIdx = body.lastIndexOf("\n}")
  if (closeIdx < 0) return null
  return {
    exportStart: m.index,
    bodyStart,
    insertAt: bodyStart + closeIdx,
    end,
  }
}

function extractPosKeys(block) {
  const out = new Set()
  const re = /\n\s*(pos[A-Za-z0-9_]+):\s*(?:['"]|$)/g
  let m
  while ((m = re.exec(block))) out.add(m[1])
  return out
}

function unescapeParsedI18nValue(v) {
  return String(v || "")
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\")
}

function toSingleQuotedJsLiteral(v) {
  return unescapeParsedI18nValue(v).replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

/** single- or double-quoted, same-line or next-line value */
function parsePosKeyValues(block) {
  const map = new Map()
  const re =
    /\n\s*(pos[A-Za-z0-9_]+):\s*(?:'((?:\\'|[^'])*)'|"((?:\\"|[^"])*)"|(?:\n\s*)'((?:\\'|[^'])*)'|(?:\n\s*)"((?:\\"|[^"]*)"))/g
  let m
  while ((m = re.exec(block))) {
    const key = m[1]
    const val = m[2] ?? m[3] ?? m[4] ?? m[5] ?? ""
    map.set(key, val)
  }
  return map
}

function collectUsedPosKeys(rootDir) {
  const files = []
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".next", ".git"].includes(e.name)) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p)
    }
  }
  walk(rootDir)
  const used = new Set()
  const keyRe = /\bt\(\s*["'](pos[A-Za-z0-9_]+)["']\s*\)/g
  const tourScenarioRe = /(?:titleKey|bodyKey)\s*:\s*['"](pos[A-Za-z0-9_]+)['"]/g
  for (const f of files) {
    const c = fs.readFileSync(f, "utf8")
    let m
    while ((m = keyRe.exec(c))) used.add(m[1])
    if (f.replace(/\\/g, "/").includes("lib/pos-tour/scenarios/") && f.endsWith(".ts")) {
      while ((m = tourScenarioRe.exec(c))) used.add(m[1])
    }
  }
  return used
}

function getPosDictKeysByLang(source = readPosI18nSource()) {
  const dictKeys = {}
  for (const lang of LANGS) {
    const range = getExportRange(source, LANG_TO_EXPORT[lang])
    const block = range ? source.slice(range.bodyStart, range.end) : ""
    dictKeys[lang] = extractPosKeys(block)
  }
  return dictKeys
}

module.exports = {
  POS_I18N_PATH,
  LANGS,
  LANG_TO_EXPORT,
  readPosI18nSource,
  getExportRange,
  extractPosKeys,
  parsePosKeyValues,
  toSingleQuotedJsLiteral,
  collectUsedPosKeys,
  getPosDictKeysByLang,
}
