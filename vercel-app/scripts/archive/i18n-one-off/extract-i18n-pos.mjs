/**
 * move-only: i18n.ts 내 pos[A-Z]* 키 → lib/i18n-pos.ts
 * 실행: node scripts/extract-i18n-pos.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const i18nPath = path.join(root, 'lib', 'i18n.ts')
const outPath = path.join(root, 'lib', 'i18n-pos.ts')

const LOCALE_MARKERS = [
  { locale: 'ko', start: /^  ko: \{$/, end: /^  en: \{$/ },
  { locale: 'en', start: /^  en: \{$/, end: /^  th: \{$/ },
  { locale: 'th', start: /^  th: \{$/, end: /^  mm: \{$/ },
  { locale: 'mm', start: /^  mm: \{$/, end: /^  la: \{$/ },
  { locale: 'la', start: /^  la: \{$/, end: /^  kh: \{$/ },
  { locale: 'kh', start: /^  kh: \{$/, end: /^  vi: \{$/ },
  { locale: 'vi', start: /^  vi: \{$/, end: /^  ms: \{$/ },
  { locale: 'ms', start: /^  ms: \{$/, end: /^} as const$/ },
]

const POS_KEY_RE = /^pos[A-Z]/

function isPosPropertyStart(line) {
  const m = line.match(/^    ([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/)
  if (!m) return null
  if (!POS_KEY_RE.test(m[1])) return null
  return m[1]
}

function isNewTopLevelProperty(line) {
  return /^    [a-zA-Z_.]/.test(line)
}

function isLocaleStructureLine(line) {
  if (/^  \}\s*(as Record<string, string>)?,?\s*$/.test(line)) return true
  if (/^  \/\*\*/.test(line)) return true
  return false
}

function extractProperty(lines, startIdx) {
  const propLines = [lines[startIdx]]
  let i = startIdx + 1
  while (i < lines.length) {
    const line = lines[i]
    if (isLocaleStructureLine(line)) break
    if (isNewTopLevelProperty(line)) break
    propLines.push(line)
    i++
  }
  return { propLines, nextIdx: i }
}

function parseLocaleBlock(lines) {
  const kept = []
  const extracted = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (isLocaleStructureLine(line)) {
      kept.push(line)
      i++
      continue
    }
    if (isPosPropertyStart(line)) {
      const { propLines, nextIdx } = extractProperty(lines, i)
      extracted.push(propLines.join('\n'))
      i = nextIdx
    } else {
      kept.push(line)
      i++
    }
  }
  return { kept, extracted }
}

function findLocaleRanges(lines) {
  const ranges = []
  for (const { locale, start, end } of LOCALE_MARKERS) {
    const startIdx = lines.findIndex((l) => start.test(l))
    if (startIdx < 0) throw new Error(`locale start not found: ${locale}`)
    const endIdx = lines.findIndex((l, idx) => idx > startIdx && end.test(l))
    if (endIdx < 0) throw new Error(`locale end not found: ${locale}`)
    ranges.push({ locale, startIdx, endIdx, bodyStart: startIdx + 1, bodyEnd: endIdx })
  }
  return ranges
}

function formatPosExport(locale, extractedLines) {
  const constName = `I18N_POS_${locale.toUpperCase()}`
  const body = extractedLines.join('\n')
  return `export const ${constName}: Record<string, string> = {\n${body}\n}`
}

const raw = fs.readFileSync(i18nPath, 'utf8')
const lines = raw.split(/\r?\n/)
const ranges = findLocaleRanges(lines)

const byLocale = {}
let totalExtracted = 0

for (const { locale, bodyStart, bodyEnd } of ranges) {
  const bodyLines = lines.slice(bodyStart, bodyEnd)
  const { kept, extracted } = parseLocaleBlock(bodyLines)
  byLocale[locale] = { kept, extracted, bodyStart, bodyEnd }
  totalExtracted += extracted.length
  console.log(`${locale}: extracted ${extracted.length}, kept ${kept.length}`)
}

const posFileParts = [
  '/** POS · 결제 · 단말 UI — i18n.ts에서 분리 (move only) */',
  '',
  ...LOCALE_MARKERS.map(({ locale }) => formatPosExport(locale, byLocale[locale].extracted)),
  '',
]
fs.writeFileSync(outPath, posFileParts.join('\n'))
console.log(`Wrote ${outPath}`)

const newLines = [...lines]
for (let li = ranges.length - 1; li >= 0; li--) {
  const { bodyStart, bodyEnd } = ranges[li]
  const { kept } = byLocale[ranges[li].locale]
  newLines.splice(bodyStart, bodyEnd - bodyStart, ...kept)
}

const lastImportIdx = newLines.findLastIndex((l) => /^import .* from "\.\/i18n-/.test(l))
if (lastImportIdx < 0) throw new Error('import anchor not found')
newLines.splice(
  lastImportIdx + 1,
  0,
  'import {',
  ...LOCALE_MARKERS.map(({ locale }) => `  I18N_POS_${locale.toUpperCase()},`),
  '} from "./i18n-pos"'
)

for (let li = LOCALE_MARKERS.length - 1; li >= 0; li--) {
  const { locale, start } = LOCALE_MARKERS[li]
  const startIdx = newLines.findIndex((l) => start.test(l))
  const next = LOCALE_MARKERS[li + 1]
  const endMarker = next ? next.start : /^} as const$/
  const endIdx = newLines.findIndex((l, idx) => idx > startIdx && endMarker.test(l))
  const firstSpread = newLines.findIndex((l, idx) => idx > startIdx && idx < endIdx && /^\s+\.\.\.I18N_/.test(l))
  if (firstSpread < 0) throw new Error(`spread anchor missing for ${locale}`)
  newLines.splice(firstSpread, 0, `    ...I18N_POS_${locale.toUpperCase()},`)
}

fs.writeFileSync(i18nPath, newLines.join('\n'))
console.log(`Updated ${i18nPath}, total extracted: ${totalExtracted}`)
