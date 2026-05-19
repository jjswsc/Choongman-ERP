/**
 * stock_logs.location 집계 시 매장/본사명 변형을 동일하게 맞추기 위한 패턴 목록.
 * getAppData(get_store_stock)와 사용량 집계 API에서 공통 사용.
 */
import { OFFICE_STORES } from '@/lib/permissions'

export const OFFICE_LOCATIONS = ['office', '본사', '오피스', '본점']
/** 입고 시 "입고등록"(HQ Warehouse) 선택 시 location */
export const INBOUND_HQ_LOCATION = '입고등록'

/** 재고 화면에서 본사(또는 입고등록 창고)를 고른 경우 — 출고 기준 집계 */
export function isOfficeStockSelection(store: string): boolean {
  const storeNorm = String(store || '').toLowerCase().trim()
  if (!storeNorm) return false
  const isOffice = OFFICE_LOCATIONS.some((x) => storeNorm === x || storeNorm.includes(x))
  const isInboundHq = storeNorm === INBOUND_HQ_LOCATION.toLowerCase()
  return isOffice || isInboundHq
}

const STORE_ALIASES: Record<string, string[]> = {
  ekkamai: ['เอกมัย', 'สาขาเอกมัย', 'ekkamai', 'cm ekkamai', 'cm ekamai', '에까마이'],
  'เอกมัย': ['ekkamai', 'สาขาเอกมัย', 'เอกมัย', 'cm ekkamai', '에까마이'],
  '에까마이': ['ekkamai', 'cm ekkamai', 'cm ekamai', 'เอกมัย', 'สาขาเอกมัย', 'CM Ekkamai', '에까마이'],
  jidubang: ['jidubang'],
  huamak: ['huamak'],
  silom: ['silom'],
}

function getLocationVariants(storeNorm: string): string[] {
  const variants = new Set<string>([storeNorm])
  const cmPrefix = /^cm\s+/i
  if (cmPrefix.test(storeNorm)) {
    const withoutCm = storeNorm.replace(cmPrefix, '').trim()
    if (withoutCm) variants.add(withoutCm)
  }
  const aliases = STORE_ALIASES[storeNorm]
  if (aliases) aliases.forEach((a) => variants.add(a))
  return Array.from(variants)
}

/**
 * stock_logs 조회용 location ilike 패턴.
 * - 화면에서 선택한 매장명(원문) 포함 → POS 등에 저장된 location 과 맞추기 쉬움
 * - ilike 는 대소문자 무시이나, 동일 매장을 두 번 집계하지 않도록 소문자 기준으로 중복 제거
 */
export function getStockLocationPatterns(store: string): string[] {
  const raw = String(store || '').trim()
  if (!raw) return []
  const storeNorm = raw.toLowerCase()

  const isOffice = OFFICE_LOCATIONS.some((x) => storeNorm === x || storeNorm.includes(x))
  const isInboundHq = storeNorm === INBOUND_HQ_LOCATION.toLowerCase()

  const candidates = new Set<string>()
  const add = (s: string) => {
    const t = String(s || '').trim()
    if (t) candidates.add(t)
  }

  add(raw)

  if (isOffice) {
    add(INBOUND_HQ_LOCATION)
    OFFICE_LOCATIONS.forEach(add)
    // 화면에서는 본사 매장을 "CM Office"로 묶지만, stock_logs에는 본사/오피스/입고등록 등 여러 location 문자열이 섞임.
    OFFICE_STORES.forEach(add)
  } else if (isInboundHq) {
    add(INBOUND_HQ_LOCATION)
  } else {
    getLocationVariants(storeNorm).forEach(add)
  }

  const seenLower = new Set<string>()
  const out: string[] = []
  for (const p of candidates) {
    const k = p.toLowerCase()
    if (seenLower.has(k)) continue
    seenLower.add(k)
    out.push(p)
  }
  return out
}
