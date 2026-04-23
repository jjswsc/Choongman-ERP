const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")
const i18nPath = path.join(root, "lib", "i18n.ts")
const source = fs.readFileSync(i18nPath, "utf8")

const langs = ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"]
const targetLangsArg = process.env.TARGET_LANGS
const defaultTargets = langs.filter((l) => l !== "en")
const targets = new Set(
  (targetLangsArg ? targetLangsArg.split(",").map((s) => s.trim()).filter(Boolean) : defaultTargets)
    .filter((l) => l !== "en")
)

function getLangRange(src, lang) {
  const startRe = new RegExp(`\\n\\s*${lang}:\\s*\\{`)
  const m = startRe.exec(src)
  if (!m || m.index == null) return null
  const start = m.index
  let end = src.length
  for (const l of langs) {
    if (l === lang) continue
    const nextRe = new RegExp(`\\n\\s*${l}:\\s*\\{`, "g")
    nextRe.lastIndex = start + 1
    const mm = nextRe.exec(src)
    if (mm && mm.index > start && mm.index < end) end = mm.index
  }
  return { start, end }
}

function parseKeyValues(block) {
  const map = new Map()
  const re = /\n\s*([A-Za-z0-9_]+):\s*'((?:\\'|[^'])*)',/g
  let m
  while ((m = re.exec(block))) {
    map.set(m[1], m[2])
  }
  return map
}

function collectUsedPosKeys() {
  const files = []
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".next", ".git"].includes(e.name)) continue
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p)
    }
  }
  walk(root)
  const used = new Set()
  const re = /t\(\s*["'](pos[A-Za-z0-9_]+)["']\s*\)/g
  const tourScenarioRe = /(?:titleKey|bodyKey)\s*:\s*['"](pos[A-Za-z0-9_]+)['"]/g
  for (const f of files) {
    const c = fs.readFileSync(f, "utf8")
    let m
    while ((m = re.exec(c))) used.add(m[1])
    if (f.replace(/\\/g, "/").includes("lib/pos-tour/scenarios/") && f.endsWith(".ts")) {
      while ((m = tourScenarioRe.exec(c))) used.add(m[1])
    }
  }
  return used
}

const enRange = getLangRange(source, "en")
if (!enRange) throw new Error("en block not found")
const enBlock = source.slice(enRange.start, enRange.end)
const enMap = parseKeyValues(enBlock)
const usedPosKeys = [...collectUsedPosKeys()].sort()

let next = source
const edits = []

for (const lang of langs) {
  if (!targets.has(lang)) continue
  const range = getLangRange(next, lang)
  if (!range) continue
  const block = next.slice(range.start, range.end)
  const langMap = parseKeyValues(block)
  const missing = usedPosKeys.filter((k) => !langMap.has(k) && enMap.has(k))
  if (!missing.length) continue

  const closeToken = block.includes("\n  } as Record<string, string>,")
    ? "\n  } as Record<string, string>,"
    : "\n  },"
  const closeIdx = block.lastIndexOf(closeToken)
  if (closeIdx < 0) continue

  const addLines = missing
    .map((k) => {
      const v = String(enMap.get(k) || "").replace(/'/g, "\\'")
      return `    ${k}: '${v}',`
    })
    .join("\n")

  const updatedBlock = block.slice(0, closeIdx) + "\n" + addLines + block.slice(closeIdx)
  edits.push({ lang, start: range.start, end: range.end, updatedBlock, added: missing.length })
}

edits.sort((a, b) => b.start - a.start)
for (const e of edits) {
  next = next.slice(0, e.start) + e.updatedBlock + next.slice(e.end)
}

if (edits.length) {
  fs.writeFileSync(i18nPath, next, "utf8")
}

for (const e of edits.reverse()) {
  console.log(`${e.lang}: added ${e.added} keys`)
}
if (!edits.length) {
  console.log("no changes")
}
