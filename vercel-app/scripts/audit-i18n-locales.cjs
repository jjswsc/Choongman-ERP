/**
 * i18n.ts 로케일별 점검
 * - 중복 키: 동일 로케일 객체 안에 같은 키가 두 번이면 JS는 마지막 값만 사용 → 번역이 덮어써짐.
 * - 스크립트 혼입: 참고용(의도적 다국어 표기, ฿, posLang*, 카테고리명 POS추가옵션 등)은 오탐이 많음.
 *
 * 사용: node scripts/audit-i18n-locales.cjs
 *       node scripts/audit-i18n-locales.cjs --strict   (중복만, exit 1)
 */
const fs = require("fs")
const path = require("path")

const root = path.resolve(__dirname, "..")
const i18nPath = path.join(root, "lib", "i18n.ts")
const src = fs.readFileSync(i18nPath, "utf8")

const langs = ["ko", "en", "th", "mm", "la", "kh", "vi", "ms"]

function extractLangBlock(source, lang, nextLangs) {
  const startRe = new RegExp(`\\n\\s*${lang}:\\s*\\{`)
  const m = source.match(startRe)
  if (!m || m.index == null) return { text: "", startLine: 0 }
  const start = m.index + m[0].length
  let end = source.length
  for (const n of nextLangs) {
    const re = new RegExp(`\\n\\s*${n}:\\s*\\{`)
    const mm = source.slice(start).match(re)
    if (mm && mm.index != null) {
      end = start + mm.index
      break
    }
  }
  const text = source.slice(start, end)
  const startLine = src.slice(0, start).split(/\r?\n/).length
  return { text, startLine }
}

const RE_KEY_LINE = /^    ([A-Za-z0-9_]+):/

const RE_HANGUL = /[\uAC00-\uD7A3\u3131-\u3163]/
const RE_THAI = /[\u0E00-\u0E7F]/
const RE_MYANMAR = /[\u1000-\u109F]/
const RE_KHMER = /[\u1780-\u17FF]/
const RE_LAO = /[\u0E80-\u0EDF]/

function lineScriptHits(s) {
  const hits = []
  if (RE_HANGUL.test(s)) hits.push("hangul")
  if (RE_THAI.test(s)) hits.push("thai")
  if (RE_MYANMAR.test(s)) hits.push("myanmar")
  if (RE_KHMER.test(s)) hits.push("khmer")
  if (RE_LAO.test(s)) hits.push("lao")
  return hits
}

const expectedScript = {
  ko: new Set(["hangul"]),
  en: new Set(),
  th: new Set(["thai"]),
  mm: new Set(["myanmar"]),
  la: new Set(["lao"]),
  kh: new Set(["khmer"]),
  vi: new Set(),
  ms: new Set(),
}

function shouldSkipScriptLine(line) {
  const t = line.trim()
  if (t.startsWith("//")) return true
  if (/posLang(Ko|En|Th|Mm|La|Kh|Vi|Ms)\s*:/.test(t)) return true
  if (/฿/.test(t)) return true
  if (/POS추가옵션/.test(t)) return true
  if (/ลากิจ/.test(t)) return true
  if (/ภ\.พ\.30|ภ\.ง\.ด/.test(t)) return true
  if (/^\s*\/\*\*/.test(line)) return true
  return false
}

const issues = { duplicates: [], scriptMismatch: [] }
const strict = process.argv.includes("--strict")

for (let i = 0; i < langs.length; i++) {
  const lang = langs[i]
  const { text, startLine } = extractLangBlock(src, lang, langs.slice(i + 1))
  if (!text) continue

  const blockLines = text.split(/\r?\n/)
  const keyOccurrences = new Map()

  blockLines.forEach((line, idx) => {
    const m = RE_KEY_LINE.exec(line)
    if (!m) return
    const key = m[1]
    const fileLine = startLine + idx
    if (!keyOccurrences.has(key)) keyOccurrences.set(key, [])
    keyOccurrences.get(key).push(fileLine)
  })

  for (const [key, fileLines] of keyOccurrences) {
    if (fileLines.length > 1) {
      issues.duplicates.push({ lang, key, lines: fileLines })
    }
  }

  if (strict) continue

  const allowed = expectedScript[lang] || new Set()
  blockLines.forEach((line, idx) => {
    if (!line.trim() || shouldSkipScriptLine(line)) return
    const hits = lineScriptHits(line)
    const unexpected = hits.filter((h) => !allowed.has(h))
    if (unexpected.length === 0) return
    const fileLine = startLine + idx
    for (const h of unexpected) {
      issues.scriptMismatch.push({ lang, fileLine, script: h, preview: line.trim().slice(0, 120) })
    }
  })
}

console.log("=== i18n.ts 로케일 감사 ===\n")

if (issues.duplicates.length) {
  console.log(`[중복 키] ${issues.duplicates.length}건 (동일 로케일에서 나중 줄이 이깁니다)\n`)
  for (const d of issues.duplicates) {
    console.log(`  ${d.lang}  ${d.key}  → 줄: ${d.lines.join(", ")}`)
  }
  console.log("")
} else {
  console.log("[중복 키] 없음\n")
}

if (!strict) {
  if (issues.scriptMismatch.length) {
    console.log(
      `[스크립트 혼입 참고] ${issues.scriptMismatch.length}줄 (posLang/฿/POS추가옵션/주석 제외 후에도 남는 경우만 의미 있음)\n`,
    )
    const cap = 80
    issues.scriptMismatch.slice(0, cap).forEach((s) => {
      console.log(`  ${s.lang}:${s.fileLine} [${s.script}] ${s.preview}`)
    })
    if (issues.scriptMismatch.length > cap) {
      console.log(`  ... 외 ${issues.scriptMismatch.length - cap}줄`)
    }
    console.log("")
  } else {
    console.log("[스크립트 혼입] (필터 후) 없음\n")
  }
}

const bad = issues.duplicates.length > 0
process.exit(bad ? 1 : 0)
