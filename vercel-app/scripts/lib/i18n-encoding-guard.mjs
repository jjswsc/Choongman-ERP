/**
 * i18n UTF-8 손상(??? 치환) 조기 감지
 * - 대상: lib/i18n.ts(헤더) + lib/i18n-locales/<lang>.ts + lib/i18n-pos-locales/<lang>.ts
 * - CI·build:prep: check-i18n-encoding.mjs → assertI18nEncodingOk
 * - 스크립트로 로케일 파일을 쓸 때: writeI18nLocaleFileSync
 */
import fs from "fs"
import path from "path"

/** 로케일별 앵커: 손상되면 ASCII `?` 로 바뀌는 대표 키 */
const ANCHORS = {
  ko: { all: /전체/, search: /검색/, welcome: /환영/ },
  th: { welcome: /[\u0E00-\u0E7F]/ },
  mm: { all: /[\u1000-\u109F]/ },
}

/** POS 사전에서 비ASCII 스크립트가 반드시 1개 이상 있어야 하는 언어 */
const POS_SCRIPT = {
  ko: /[\uAC00-\uD7A3]/,
  th: /[\u0E00-\u0E7F]/,
  mm: /[\u1000-\u109F]/,
}

function extractScalarValue(source, key) {
  const re = new RegExp(`^\\s{2}${key}: '((?:\\\\'|[^'])*)'`, "m")
  const m = source.match(re)
  return m?.[1]?.replace(/\\'/g, "'") ?? null
}

function isQuestionMarkCorruption(value) {
  if (!value) return false
  if (/\?{3,}/.test(value)) return true
  if (/^[\?\s.!,]+$/.test(value) && value.includes("?")) return true
  return false
}

/**
 * @param {{ i18nTs: string, locales: Record<string, string>, posLocales: Record<string, string> }} src
 * @returns {{ ok: true } | { ok: false, errors: string[] }}
 */
export function assertI18nEncodingOk({ i18nTs, locales, posLocales }) {
  const errors = []

  if (!i18nTs.includes("공통 번역")) {
    errors.push("lib/i18n.ts header missing '공통 번역' (possible ASCII ? replacement)")
  }

  for (const [lang, anchors] of Object.entries(ANCHORS)) {
    const source = locales[lang]
    if (source == null) {
      errors.push(`lib/i18n-locales/${lang}.ts missing`)
      continue
    }
    for (const [key, pattern] of Object.entries(anchors)) {
      const val = extractScalarValue(source, key)
      if (val == null) {
        errors.push(`${lang}.${key} missing`)
      } else if (isQuestionMarkCorruption(val)) {
        errors.push(`${lang}.${key} looks corrupted: '${val}'`)
      } else if (!pattern.test(val)) {
        errors.push(`${lang}.${key} expected native script, got '${val}'`)
      }
    }
  }

  for (const [lang, pattern] of Object.entries(POS_SCRIPT)) {
    const source = posLocales[lang]
    if (source == null) {
      errors.push(`lib/i18n-pos-locales/${lang}.ts missing`)
    } else if (!pattern.test(source)) {
      errors.push(`lib/i18n-pos-locales/${lang}.ts has no native script (possible ASCII ? replacement)`)
    }
  }

  if (errors.length) return { ok: false, errors }
  return { ok: true }
}

/** @param {string} libDir vercel-app/lib 절대경로 */
export function readI18nSources(libDir) {
  const readDir = (dir) => {
    const out = {}
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".ts")) out[f.slice(0, -3)] = fs.readFileSync(path.join(dir, f), "utf8")
    }
    return out
  }
  return {
    i18nTs: fs.readFileSync(path.join(libDir, "i18n.ts"), "utf8"),
    locales: readDir(path.join(libDir, "i18n-locales")),
    posLocales: readDir(path.join(libDir, "i18n-pos-locales")),
  }
}

/** 로케일 파일 1개 저장 후 전체 인코딩 재검사 — 실패 시 원본 복구 */
export function writeI18nLocaleFileSync(libDir, filePath, content) {
  const before = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : null
  fs.writeFileSync(filePath, content, "utf8")
  const result = assertI18nEncodingOk(readI18nSources(libDir))
  if (!result.ok) {
    if (before != null) fs.writeFileSync(filePath, before, "utf8")
    console.error("i18n encoding guard blocked write:")
    for (const e of result.errors) console.error(`  - ${e}`)
    process.exit(1)
  }
}
