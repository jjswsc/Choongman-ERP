/**
 * POS 영수증/인쇄용: 테이블명 끝 `번` 제거·치킨 부위 표기 영문 통일 등.
 */

import {
  resolveMemberPortalTakeoutMeta,
  translateMemberPortalReceiptTableName,
} from '@/lib/pos-member-portal-takeout-label'

/** 치킨 기본가에 해당하는 대표 옵션 표기(표시·카트 기본 선택 등). DB 레거시 `S 순살`과 병행 인식. */
export const POS_CHICKEN_DEFAULT_OPTION_DISPLAY = 'S Boneless'

/**
 * 치킨 부위 한글(순살·윙·봉)을 영문 Boneless / Wing / Drumette 로 통일.
 * 메뉴·옵션명·장바구니·영수증에서 번역 키와 혼용되지 않도록 단일 표기 유지.
 */
export function canonicalEnglishChickenMenuLine(text: string): string {
  let out = String(text ?? '')
  out = out.replace(/순살/gi, 'Boneless')
  out = out.replace(/윙/g, 'Wing')
  out = out.replace(/봉/g, 'Drumette')
  return out
}

/**
 * 옵션 `part` 단계 값·이름에서 한·영 혼용·사이즈 접두(M - 순살 등)를 묶어
 * 가상「부위 후보」목록·중복 제거용 키로 쓴다.
 */
export function chickenPartDedupeKey(raw: string): string {
  const canon = canonicalEnglishChickenMenuLine(String(raw ?? '').trim())
  const noSize = canon.replace(/^\s*[SML]\s*[-–—\s]+\s*/i, '').trim() || canon
  const t = noSize.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!t) return ''
  if (t === 'boneless' || t.includes('boneless')) return 'boneless'
  if (/\bdrumette\b/.test(t) || t.includes('wing stick')) return 'drumette'
  if (t === 'wing' || t === 'wings' || /\bwing\b/.test(t)) return 'wing'
  return t
}

/** `chickenPartDedupeKey` 결과에 맞는 라이브러리 한 줄 표기(알 수 없으면 영문 정규화·사이즈 접두 제거). */
export function prettyChickenPartLibraryLabel(dedupeKey: string, originalRaw: string): string {
  const k = String(dedupeKey ?? '').trim().toLowerCase()
  if (k === 'boneless') return 'Boneless'
  if (k === 'wing' || k === 'wings') return 'Wing'
  if (k === 'drumette') return 'Drumette'
  const canon = canonicalEnglishChickenMenuLine(String(originalRaw ?? '').trim())
  const noSize = canon.replace(/^\s*[SML]\s*[-–—\s]+\s*/i, '').trim() || canon
  return noSize || String(originalRaw ?? '').trim()
}

/**
 * 저장 시점 언어로 남은 포장 슬롯 라벨(예: ko `포장 3`)을 현재 UI 언어로 다시 표시.
 * `posTakeoutSlotN`에 쓰인 접두사와 동일 목록.
 */
const TAKEOUT_SLOT_LABEL_PREFIXES = [
  '포장',
  'Takeout',
  'ห่อกลับ',
  'ထုပ်ယူ',
  'ຫໍ່ກັບ',
  'យកតាមខ្លួន',
  'Mang đi',
  'Bungkus',
  'ซื้อกลับบ้าน',
] as const

/** 포장 슬롯 라벨(예: `Takeout 2`, `포장 2`)에서 번호만 추출. 매칭용. */
export function extractTakeoutSlotNumberFromLabel(raw: string | undefined | null): string | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  for (const prefix of TAKEOUT_SLOT_LABEL_PREFIXES) {
    const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const slotRe = new RegExp(`^${esc}\\s*#?\\s*(\\d+)\\s*$`, 'iu')
    const slotMatch = s.match(slotRe)
    if (slotMatch) return slotMatch[1]
  }
  return null
}

function tryTranslateTakeoutTableLabel(s: string, t: (key: string) => string): string | null {
  const pick = (key: string): string | null => {
    const raw = String(t(key) ?? '').trim()
    if (!raw) return null
    if (raw === key) return null
    if (/^pos[A-Z]/.test(raw)) return null
    return raw
  }
  for (const prefix of TAKEOUT_SLOT_LABEL_PREFIXES) {
    const esc = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const slotRe = new RegExp(`^${esc}\\s*#?\\s*(\\d+)\\s*$`, 'iu')
    const slotMatch = s.match(slotRe)
    if (slotMatch) {
      const tmpl = pick('posTakeoutSlotN')
      // 인쇄 i18n에 슬롯 키가 없으면 원문 유지(한국어 fallback으로 덮어쓰지 않음)
      if (!tmpl) return null
      return tmpl.replace(/\{\{n\}\}/g, slotMatch[1])
    }
    if (s.localeCompare(prefix, undefined, { sensitivity: 'accent' }) === 0) {
      return pick('posTakeoutSlot') || pick('posOrderTypeTakeout') || null
    }
  }
  const directTakeoutSlotN = /^posTakeoutSlotN$/i.test(s)
  if (directTakeoutSlotN) {
    const tmpl = pick('posTakeoutSlotN')
    return tmpl || null
  }
  const directTakeoutSlot = /^posTakeoutSlot$/i.test(s)
  if (directTakeoutSlot) return pick('posTakeoutSlot') || pick('posOrderTypeTakeout') || null
  return null
}

/**
 * 포장 주문·슬롯 표시명: DB/저장 시점 언어(예: ko `포장 1`)을 현재 UI 언어로 변환.
 * `customerName`·`tableName`·카트 라벨 등에 공통 사용.
 */
export function translateTakeoutOrderDisplayLabel(
  raw: string | undefined | null,
  t: (key: string) => string,
  options?: { fallbackOrderId?: number | string }
): string {
  const pick = (key: string, fallback = ''): string => {
    const raw = String(t(key) ?? '').trim()
    if (!raw) return fallback
    if (raw === key) return fallback
    if (/^pos[A-Z]/.test(raw)) return fallback
    return raw
  }
  const s = String(raw ?? '').trim()
  if (s) return translateReceiptTableDisplayName(s, t)
  const id = options?.fallbackOrderId
  if (id != null && String(id).trim() !== '') {
    return `${pick('posOrderTypeTakeout', '포장')} #${id}`
  }
  return pick('posOrderTypeTakeout', '포장')
}

/** 테이블명 끝 한글 접미사 `번` 제거 (1F-2번 → 1F-2). 포장 슬롯명은 `t`가 있으면 현재 언어로 표시. */
export function translateReceiptTableDisplayName(tableName: string, t?: (key: string) => string): string {
  let s = String(tableName || '').trim()
  if (!s) return s
  s = s
    .replace(/^(?:\d+\s*f(?:loor)?|f\s*\d+|\d+\s*층|b\d+)\s*[-_/]?\s*/iu, '')
    .trimStart()
  if (/\s*번\s*$/u.test(s)) {
    s = s.replace(/\s*번\s*$/u, '').trimEnd()
  }
  if (t) {
    const memberMeta = resolveMemberPortalTakeoutMeta({ tableName: s })
    if (memberMeta.isMemberPortal) {
      return translateMemberPortalReceiptTableName(s, t)
    }
    const localized = tryTranslateTakeoutTableLabel(s, t)
    if (localized) return localized
  }
  return s
}

/**
 * 배치 테이블명 매칭 키 정규화.
 * - `4` ↔ `4번`
 * - `1F-4번`, `1층 4번`, `Table 4` ↔ `4`
 */
export function normalizePosTableNameForMatch(raw: string | undefined | null): string {
  let s = String(raw ?? '').trim().toLowerCase()
  if (!s) return ''
  s = s.replace(/\s*번\s*$/u, '').trimEnd()
  s = s.replace(/^table\s*/u, '').trimStart()
  s = s.replace(/^(?:\d+\s*f(?:loor)?|f\s*\d+|\d+\s*층|b\d+)\s*[-_/]?\s*/u, '').trimStart()
  s = s.replace(/\s+/gu, ' ').trim()
  if (/^\d+$/u.test(s)) return String(Number(s))
  return s
}

/** 품목 줄 표시: 치킨 부위 한글 → 영문 통일. `t`는 호환용(미사용). */
export function translatePosMenuLineForReceipt(name: string, _t?: (key: string) => string): string {
  if (!name?.trim()) return name ?? ''
  return canonicalEnglishChickenMenuLine(String(name))
}
