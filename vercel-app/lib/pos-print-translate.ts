/**
 * POS 영수증/인쇄용: 테이블명 끝 `번` 제거·치킨 부위 옵션명 번역 등.
 */

import { getClientUiLang, getUiString } from '@/lib/i18n'

/** 테이블명 끝 한글 접미사 `번` 제거 (1F-2번 → 1F-2). 언어와 무관하게 표시만 정리. */
export function translateReceiptTableDisplayName(tableName: string, _t?: (key: string) => string): string {
  const s = String(tableName || '').trim()
  if (!s) return s
  if (!/\s*번\s*$/u.test(s)) return s
  return s.replace(/\s*번\s*$/u, '').trimEnd()
}

/**
 * 배치 테이블명 `4` vs 주문 `table_name` `4번` 등 매칭용 (소문자·trim·끝 `번` 제거).
 */
export function normalizePosTableNameForMatch(raw: string | undefined | null): string {
  let s = String(raw ?? '').trim().toLowerCase()
  if (!s) return ''
  s = s.replace(/\s*번\s*$/u, '').trimEnd()
  return s
}

type PartKey = 'posOptionPartBoneless' | 'posOptionPartWing' | 'posOptionPartDrumstick'

/** `t`가 키 문자열만 돌려줄 때(폴백 `k=>k` 등)에도 UI 언어·영문 사전으로 부위명 확보 */
function resolvePartLabel(t: (key: string) => string, key: PartKey): string {
  const v = t(key)
  if (v && v !== key) return v
  const lang = getClientUiLang()
  let g = getUiString(lang, key)
  if (g && g !== key) return g
  g = getUiString('en', key)
  return g && g !== key ? g : v || key
}

/** 품목 줄에 포함된 순살/윙/봉 한글을 현재 언어 문구로 치환 ("M - 순살" 등) */
export function translatePosMenuLineForReceipt(name: string, t: (key: string) => string): string {
  if (!name?.trim()) return name ?? ''
  let out = String(name)
  const boneless = resolvePartLabel(t, 'posOptionPartBoneless')
  const wing = resolvePartLabel(t, 'posOptionPartWing')
  const drum = resolvePartLabel(t, 'posOptionPartDrumstick')
  if (boneless) out = out.replace(/순살/g, boneless)
  if (wing) out = out.replace(/윙/g, wing)
  if (drum) out = out.replace(/봉/g, drum)
  return out
}
