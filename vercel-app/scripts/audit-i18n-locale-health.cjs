/**
 * 로케일 블록 단위 건강 검사: 중복 키(마지막 값이 이김), 금지 스크립트 혼입, 흔한 영어 폴백 잔류.
 * 사용: node scripts/audit-i18n-locale-health.cjs
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
  if (!m || m.index == null) return ""
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
  return source.slice(start, end)
}

/** key: 줄에서 첫 번째로 매칭되는 속성명 (따옴표/백틱 값 시작) */
function collectKeys(block) {
  const re = /\n\s*([A-Za-z0-9_]+):\s*["'`]/g
  const keys = []
  let m
  while ((m = re.exec(block))) keys.push(m[1])
  return keys
}

function duplicateKeys(keys) {
  const counts = new Map()
  for (const k of keys) counts.set(k, (counts.get(k) || 0) + 1)
  return [...counts.entries()]
    .filter(([, c]) => c > 1)
    .sort((a, b) => b[1] - a[1])
}

const RE = {
  hangul: /[\uAC00-\uD7AF]/,
  thai: /[\u0E00-\u0E7F]/,
  myanmar: /[\u1000-\u109F]/,
  khmer: /[\u1780-\u17FF]/,
  lao: /[\u0E80-\u0EFF]/,
}

function scriptFlags(lang, key, value) {
  if (/^posLang/.test(key)) return []
  if (key === "posLangKo" || key === "posLangTh" || key === "posLangMm" || key === "posLangLa" || key === "posLangKh" || key === "posLangVi" || key === "posLangMs" || key === "posLangEn")
    return []

  const bad = []
  if (lang !== "ko" && RE.hangul.test(value) && key !== "posLangKo") bad.push("hangul")
  if (lang !== "th" && RE.thai.test(value) && key !== "posLangTh") bad.push("thai")
  if (lang !== "mm" && RE.myanmar.test(value) && key !== "posLangMm") bad.push("myanmar")
  if (lang !== "kh" && RE.khmer.test(value) && key !== "posLangKh") bad.push("khmer")
  if (lang !== "la" && RE.lao.test(value) && key !== "posLangLa") bad.push("lao")
  return bad
}

/** 한 줄짜리 '...' 또는 "..." 값만 검사 (대부분의 키) */
function extractSingleQuotedPairs(block) {
  const pairs = []
  const lines = block.split("\n")
  for (const line of lines) {
    const m = line.match(/^\s+([A-Za-z0-9_]+):\s*(['"])([\s\S]*?)\2\s*,?\s*$/)
    if (m) pairs.push({ key: m[1], value: m[3], line: line.trim().slice(0, 120) })
  }
  return pairs
}

const EN_SNIPPETS = [
  "Kitchen Printer",
  "Auto (by category)",
  "Save failed",
  "Button Color",
  "Stock Control",
  "Cancel order",
  "Merchant receipt",
  "Cooking time (min)",
  "Used for settlement",
]

function main() {
  const report = { duplicates: {}, scriptMix: [], englishSnippets: [] }

  for (let i = 0; i < langs.length; i++) {
    const lang = langs[i]
    const block = extractLangBlock(src, lang, langs.slice(i + 1))
    const keys = collectKeys(block)
    const dups = duplicateKeys(keys)
    if (dups.length) report.duplicates[lang] = dups

    const pairs = extractSingleQuotedPairs(block)
    for (const { key, value } of pairs) {
      const flags = scriptFlags(lang, key, value)
      if (flags.length) report.scriptMix.push({ lang, key, flags: flags.join("+"), sample: value.slice(0, 60) })
    }

    if (lang !== "en" && lang !== "ko") {
      for (const s of EN_SNIPPETS) {
        for (const { key, value } of pairs) {
          if (value.includes(s)) report.englishSnippets.push({ lang, key, snippet: s })
        }
      }
    }
  }

  console.log("=== 중복 키 (같은 로케일 블록 안에서 여러 번 정의 → 마지막만 적용) ===\n")
  let dupTotal = 0
  for (const lang of langs) {
    const d = report.duplicates[lang]
    if (!d || !d.length) continue
    dupTotal += d.length
    console.log(`[${lang}] ${d.length} keys duplicated:`)
    for (const [k, c] of d) console.log(`  ${k} (${c}x)`)
    console.log("")
  }
  if (dupTotal === 0) console.log("(없음)\n")

  console.log("=== 단일따옴표 값 기준 스크립트 혼입 (posLang* 제외) ===\n")
  if (report.scriptMix.length === 0) console.log("(없음)\n")
  else {
    for (const row of report.scriptMix) {
      console.log(`[${row.lang}] ${row.key} [${row.flags}] ${JSON.stringify(row.sample)}`)
    }
    console.log("")
  }

  console.log("=== 흔한 영어 구절 잔류 (비영어 로케일, 단일따옴표 줄만) ===\n")
  const byLang = {}
  for (const row of report.englishSnippets) {
    if (!byLang[row.lang]) byLang[row.lang] = []
    byLang[row.lang].push(row)
  }
  for (const lang of langs) {
    if (lang === "en" || lang === "ko") continue
    const rows = byLang[lang]
    if (!rows || !rows.length) continue
    console.log(`[${lang}] ${rows.length} hits`)
    const seen = new Set()
    for (const r of rows) {
      const id = `${r.key}|${r.snippet}`
      if (seen.has(id)) continue
      seen.add(id)
      console.log(`  ${r.key}: contains "${r.snippet}"`)
    }
    console.log("")
  }

  const bad =
    dupTotal > 0 || report.scriptMix.length > 0
      ? 1
      : 0
  process.exit(bad)
}

main()
