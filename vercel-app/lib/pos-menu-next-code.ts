/**
 * POS 메뉴 코드 자동 발급 — 대분류 → 접두사
 * API(getNextPosMenuCode) · 관리자 UI 공통.
 *
 * - 시드(Chicken→C 등)는 기존 코드와 호환 유지
 * - 그 외·신규 대분류는 이름에서 접두사를 도출하고, 충돌 시 다른 후보로 할당
 * - 할당 결과는 system_settings(pos_menu_categories).codePrefixByMain 에 저장해 고정
 */

/** 기존 매장 코드와 호환용 시드 (변경 금지 — 이미 발급된 C001 등과 맞춤) */
export const POS_MENU_CODE_PREFIX_BY_MAIN: Record<string, string> = {
  Chicken: 'C',
  Korean: 'K',
  Side: 'S',
  Drinks: 'D',
  /** 토핑은 치킨(C)과 겹치지 않도록 T */
  Topping: 'T',
  /** Omni 등 Food 대분류 */
  Food: 'F',
  /** Omni 등 비빔밥 대분류 (BC001…) */
  Bibimbap: 'BC',
  /** 프로모 코드 P0001 과 구분 */
  Promotion: 'PM',
}

/** @deprecated 시드 대분류 목록. 신규 포함 모든 대분류가 자동 발급 대상이므로 UI는 supportsPosMenuAutoCode 사용 */
export const CODE_AUTO_MAINS = Object.keys(POS_MENU_CODE_PREFIX_BY_MAIN) as Array<
  keyof typeof POS_MENU_CODE_PREFIX_BY_MAIN
>

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function supportsPosMenuAutoCode(mainCategory: string): boolean {
  return String(mainCategory ?? '').trim().length > 0
}

function normalizeMainKey(mainCategory: string): string {
  return String(mainCategory ?? '').trim()
}

function toAlphaLetters(raw: string): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

function simpleHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 비라틴 대분류명용 A–Z 접두사 */
export function hashAlphaPrefix(seed: string, len: number): string {
  let h = simpleHash(seed)
  let out = ''
  for (let i = 0; i < Math.max(1, len); i++) {
    out += ALPHA[h % 26]
    h = Math.imul(h ^ (i + 1), 16777619) >>> 0
  }
  return out
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 메뉴 code에서 PREFIX+숫자 패턴의 접두사 추출 (예: BC001 → BC) */
export function extractPosMenuCodePrefix(code: string): string | null {
  const m = String(code ?? '')
    .trim()
    .match(/^([A-Za-z]+)(\d+)$/)
  return m ? m[1].toUpperCase() : null
}

export function buildPosMenuCodePattern(prefix: string): RegExp {
  return new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`, 'i')
}

export function computeNextPosMenuCode(prefix: string, existingCodes: Iterable<string>): string {
  const p = String(prefix ?? '').trim().toUpperCase()
  if (!p) throw new Error('prefix required')
  const pattern = buildPosMenuCodePattern(p)
  let maxNum = 0
  for (const raw of existingCodes) {
    const c = String(raw ?? '').trim()
    const m = c.match(pattern)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (Number.isFinite(n) && n > maxNum) maxNum = n
  }
  return `${p}${String(maxNum + 1).padStart(3, '0')}`
}

/**
 * 사용 중인 접두사 집합을 피하며 대분류용 접두사 후보를 고른다.
 * 시드가 있으면 시드를 우선(다른 대분류가 이미 쓰지 않는 한).
 */
export function allocatePosMenuCodePrefix(
  mainCategory: string,
  usedPrefixes: ReadonlySet<string>
): string {
  const main = normalizeMainKey(mainCategory)
  if (!main) throw new Error('mainCategory required')

  const used = new Set(
    [...usedPrefixes].map((x) => String(x ?? '').trim().toUpperCase()).filter(Boolean)
  )

  const seed = POS_MENU_CODE_PREFIX_BY_MAIN[main]
  if (seed && !used.has(seed.toUpperCase())) return seed.toUpperCase()

  const letters = toAlphaLetters(main)
  const candidates: string[] = []
  if (letters.length >= 1) candidates.push(letters.slice(0, 1))
  if (letters.length >= 2) candidates.push(letters.slice(0, 2))
  if (letters.length >= 3) candidates.push(letters.slice(0, 3))
  if (letters.length >= 4) candidates.push(letters.slice(0, 4))
  for (let i = 1; i < Math.min(letters.length, 10); i++) {
    candidates.push(letters[0] + letters[i])
  }
  if (letters.length >= 2) {
    candidates.push(letters.slice(0, 1) + letters.slice(-1))
  }
  candidates.push(hashAlphaPrefix(main, 2))
  candidates.push('X' + hashAlphaPrefix(main, 2))
  candidates.push('Z' + hashAlphaPrefix(main + '!', 3))

  for (const c of candidates) {
    const u = toAlphaLetters(c)
    if (u && !used.has(u)) return u
  }

  for (let n = 0; n < 20000; n++) {
    const u = 'X' + hashAlphaPrefix(`${main}#${n}`, 3)
    if (!used.has(u)) return u
  }
  throw new Error(`접두사 할당 실패: ${main}`)
}

export type CodePrefixEnsureResult = {
  codePrefixByMain: Record<string, string>
  changed: boolean
}

/**
 * 대분류 목록에 대해 codePrefixByMain 을 채운다.
 * - 기존 맵·시드 유지
 * - 없는 대분류만 신규 할당
 * - 삭제된 대분류 키는 맵에 남겨 두어(메뉴 잔존) 재사용 가능
 */
export function ensureCodePrefixesForMains(
  mainCategories: string[],
  existing: Record<string, string> | null | undefined,
  extraMains: string[] = []
): CodePrefixEnsureResult {
  const codePrefixByMain: Record<string, string> = {}
  for (const [k, v] of Object.entries(existing || {})) {
    const main = normalizeMainKey(k)
    const prefix = toAlphaLetters(String(v ?? ''))
    if (main && prefix) codePrefixByMain[main] = prefix
  }

  const mains = [
    ...new Set(
      [...mainCategories, ...extraMains].map(normalizeMainKey).filter(Boolean)
    ),
  ]

  // 시드 선반영(아직 맵에 없을 때)
  for (const main of mains) {
    if (codePrefixByMain[main]) continue
    const seed = POS_MENU_CODE_PREFIX_BY_MAIN[main]
    if (seed) codePrefixByMain[main] = seed.toUpperCase()
  }

  let changed = JSON.stringify(codePrefixByMain) !== JSON.stringify(existing || {})

  for (const main of mains) {
    if (codePrefixByMain[main]) continue
    const used = new Set(Object.values(codePrefixByMain))
    const allocated = allocatePosMenuCodePrefix(main, used)
    codePrefixByMain[main] = allocated
    changed = true
  }

  // 시드와 맵이 달라도 기존 맵 유지(이미 발급된 코드 보호). 시드만 새로 채울 때 위에서 처리.

  if (!changed) {
    // existing 키가 정규화·대문자화되며 달라졌는지
    const prevKeys = Object.keys(existing || {}).sort()
    const nextKeys = Object.keys(codePrefixByMain).sort()
    if (prevKeys.length !== nextKeys.length || prevKeys.some((k, i) => k !== nextKeys[i])) {
      changed = true
    } else {
      for (const k of nextKeys) {
        if (String((existing || {})[k] ?? '').toUpperCase() !== codePrefixByMain[k]) {
          changed = true
          break
        }
      }
    }
  }

  return { codePrefixByMain, changed }
}

/** 대분류 이름 변경 시 접두사 맵 키 이전 */
export function remapCodePrefixesOnMainRename(
  codePrefixByMain: Record<string, string>,
  renames: Iterable<readonly [string, string]>
): Record<string, string> {
  const next = { ...codePrefixByMain }
  for (const [fromRaw, toRaw] of renames) {
    const from = normalizeMainKey(fromRaw)
    const to = normalizeMainKey(toRaw)
    if (!from || !to || from === to) continue
    if (next[from] && !next[to]) {
      next[to] = next[from]
      delete next[from]
    } else if (next[from] && next[to]) {
      delete next[from]
    }
  }
  return next
}

/**
 * 조회용: 맵 → 시드 → (충돌 무시) 1차 후보.
 * 실제 발급은 ensureCodePrefixesForMains + allocate 경로를 쓴다.
 */
export function posMenuCodePrefixForMain(
  mainCategory: string,
  codePrefixByMain?: Record<string, string> | null
): string | null {
  const main = normalizeMainKey(mainCategory)
  if (!main) return null
  const fromMap = codePrefixByMain?.[main]
  if (fromMap && toAlphaLetters(fromMap)) return toAlphaLetters(fromMap)
  const seed = POS_MENU_CODE_PREFIX_BY_MAIN[main]
  if (seed) return seed.toUpperCase()
  const letters = toAlphaLetters(main)
  if (letters.length >= 2) return letters.slice(0, 2)
  if (letters.length === 1) return letters
  return hashAlphaPrefix(main, 2)
}

/** 입력란 placeholder (예: Food → F001) */
export function posMenuCodePlaceholderForMain(
  mainCategory: string,
  codePrefixByMain?: Record<string, string> | null
): string {
  const prefix = posMenuCodePrefixForMain(mainCategory, codePrefixByMain)
  if (prefix) return `${prefix}001`
  return 'C001 / F001 / T001'
}
