import { getBangkokDateRangeUtc } from '@/lib/bangkok-time'
import { escapeIlikePattern } from '@/lib/postgrest-ilike'

/** stock_logs 기간 필터 (방콕 일 경계, soft delete 제외) */
export function buildOutboundLogDateFilterLike(startStr: string, endStr: string): string {
  const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
  return `log_date=gte.${encodeURIComponent(dayStartUtcIso)}&log_date=lt.${encodeURIComponent(nextDayStartUtcIso)}&is_deleted=is.false`
}

/** PostgREST: 기존 조건과 품목 검색 or 를 and 로 묶음 (이중 or= 충돌 방지) */
export function appendItemSearchAndOr(baseFilter: string, itemSearch: string): string {
  const q = String(itemSearch || '').trim()
  if (!q) return baseFilter
  const pat = encodeURIComponent(`%${escapeIlikePattern(q)}%`)
  const itemOr = `or(item_code.ilike.${pat},item_name.ilike.${pat})`
  // base 에 이미 or= 가 있으면 and=(기존or, itemOr) 로 감싸기 어려우므로
  // 호출측에서 vendor or 와 item or 를 한 and 로 넣도록 분리 사용
  return `${baseFilter}&${itemOr}`
}

export function buildForcePushWithOptionalItemFilter(datePart: string, itemSearch: string): string {
  const q = String(itemSearch || '').trim()
  const vendorOr = `or(vendor_target.eq.HQ,vendor_target.ilike.${encodeURIComponent('%HQ%')})`
  if (!q) {
    return `log_type=eq.ForcePush&${vendorOr}&${datePart}`
  }
  const pat = encodeURIComponent(`%${escapeIlikePattern(q)}%`)
  const itemOr = `or(item_code.ilike.${pat},item_name.ilike.${pat})`
  return `log_type=eq.ForcePush&and=(${vendorOr},${itemOr})&${datePart}`
}

export function buildInboundFromHqWithOptionalItemFilter(datePart: string, itemSearch: string): string {
  const q = String(itemSearch || '').trim()
  const base = `log_type=eq.Inbound&vendor_target=ilike.${encodeURIComponent('%From HQ%')}&${datePart}`
  if (!q) return base
  const pat = encodeURIComponent(`%${escapeIlikePattern(q)}%`)
  return `${base}&or=(item_code.ilike.${pat},item_name.ilike.${pat})`
}
