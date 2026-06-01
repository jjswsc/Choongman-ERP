/**
 * POS 주문번호(order_no) 규칙 (클라이언트·서버 공통)
 * - 저장: {매장슬러그}-{YYYYMMDD}-{순번} 예: CM01-20250327-042
 * - 영수증·주방 인쇄: 순번만 3자리(001) — formatPosOrderNoForPrint
 */

import { todayStrBangkok } from '@/lib/attendance-utils'

/** 방콕 달력 오늘 YYYYMMDD */
export function bangkokTodayYmdCompact(): string {
  return todayStrBangkok().replace(/\D/g, '')
}

/** 매장코드 → order_no 접두 (영숫자 최대 12자) */
export function normalizeStoreSlugForOrderNo(storeCode: string): string {
  const s = String(storeCode || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9]/g, '')
  return s.slice(0, 12) || 'ST'
}

function escapeRegex(x: string): string {
  return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 복합 번호에서 당일·해당 슬러그의 순번 추출 */
export function parseCompositeOrderNoSeq(orderNo: string, slug: string, ymd: string): number | null {
  const re = new RegExp(`^${escapeRegex(slug)}-${escapeRegex(ymd)}-(\\d+)$`)
  const m = String(orderNo ?? '').trim().match(re)
  if (!m) return null
  const n = parseInt(m[1], 10)
  return Number.isFinite(n) ? n : null
}

/** 레거시: order_no 전체가 숫자만인 경우 (예: 001) */
export function parsePosDailyNumericOrderNo(orderNo: string): number | null {
  const s = String(orderNo ?? '').trim()
  if (!/^\d+$/.test(s)) return null
  const n = parseInt(s, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function formatPosDailyOrderSeq(seq: number): string {
  if (!Number.isFinite(seq) || seq < 1) return '001'
  if (seq <= 999) return String(seq).padStart(3, '0')
  return String(seq)
}

export function buildStoredPosOrderNo(slug: string, ymd: string, seq: number): string {
  return `${slug}-${ymd}-${formatPosDailyOrderSeq(seq)}`
}

/**
 * 영수증·주방 인쇄용 표시 번호.
 * SLUG-YYYYMMDD-SEQ → SEQ(3자리 pad), 순수 숫자 레거시 → pad, 그 외(구 ST0317A3 등)는 원문.
 */
export function formatPosOrderNoForPrint(orderNo: string): string {
  const s = String(orderNo ?? '').trim()
  if (!s) return ''
  const m = /^[A-Z0-9]+-(\d{8})-(\d+)$/.exec(s)
  if (m) {
    const n = parseInt(m[2], 10)
    if (Number.isFinite(n)) return formatPosDailyOrderSeq(n)
  }
  const pure = parsePosDailyNumericOrderNo(s)
  if (pure != null) return formatPosDailyOrderSeq(pure)
  return s
}

/** 영수증 등: order_no 문자열에서 숫자만 이어 붙임 (CMUNIONMALL-20260601-004 → 20260601004) */
export function formatPosOrderNoDigitsOnly(orderNo: string): string {
  return String(orderNo ?? '').replace(/\D/g, '')
}
