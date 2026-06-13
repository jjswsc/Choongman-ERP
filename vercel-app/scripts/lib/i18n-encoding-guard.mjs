/**
 * i18n.ts UTF-8 손상(??? 치환) 조기 감지·안전 저장
 * - patch/sync 스크립트는 writeI18nFileSync 사용
 * - CI·build:prep은 assertI18nEncodingOk 사용
 */
import fs from "fs"

const KO_ANCHORS = {
  all: /전체/,
  search: /검색/,
  welcome: /환영/,
}

const TH_ANCHORS = {
  welcome: /[\u0E00-\u0E7F]/,
}

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

function extractScalarValue(block, key) {
  const re = new RegExp(`^    ${key}: '((?:\\\\'|[^'])*)'`, "m")
  const m = block.match(re)
  return m?.[1]?.replace(/\\'/g, "'") ?? null
}

function isQuestionMarkCorruption(value) {
  if (!value) return false
  if (/\?{3,}/.test(value)) return true
  if (/^[\?\s.!,]+$/.test(value) && value.includes("?")) return true
  return false
}

/**
 * @param {string} src i18n.ts 전체 내용
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function assertI18nEncodingOk(src) {
  const errors = []

  if (!src.includes("공통 번역")) {
    errors.push("header missing '공통 번역' (possible ASCII ? replacement)")
  }

  const koBlock = extractLangBlock(src, "ko", ["en", "th", "mm", "la", "kh", "vi", "ms"])
  for (const [key, pattern] of Object.entries(KO_ANCHORS)) {
    const val = extractScalarValue(koBlock, key)
    if (val == null) {
      errors.push(`ko.${key} missing`)
      continue
    }
    if (isQuestionMarkCorruption(val)) {
      errors.push(`ko.${key} looks corrupted: '${val}'`)
      continue
    }
    if (!pattern.test(val)) {
      errors.push(`ko.${key} expected Korean anchor, got '${val}'`)
    }
  }

  const thBlock = extractLangBlock(src, "th", ["mm", "la", "kh", "vi", "ms"])
  for (const [key, pattern] of Object.entries(TH_ANCHORS)) {
    const val = extractScalarValue(thBlock, key)
    if (val == null) {
      errors.push(`th.${key} missing`)
      continue
    }
    if (isQuestionMarkCorruption(val)) {
      errors.push(`th.${key} looks corrupted: '${val}'`)
      continue
    }
    if (!pattern.test(val)) {
      errors.push(`th.${key} expected Thai script in welcome`)
    }
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true }
}

/** @param {string} filePath @param {string} content */
export function writeI18nFileSync(filePath, content) {
  const result = assertI18nEncodingOk(content)
  if (!result.ok) {
    console.error("i18n.ts encoding guard blocked write:")
    for (const e of result.errors) console.error(`  - ${e}`)
    process.exit(1)
  }
  fs.writeFileSync(filePath, content, "utf8")
}
