/**
 * POS 주문번호 할당 (서버 전용)
 * 저장 형식: 매장슬러그-YYYYMMDD-순번 (lib/pos-order-no.ts)
 * 동시 다발 주문 시 순번 겹침 가능(드묾) → 필요 시 DB 시퀀스 RPC 권장.
 */

import { bangkokDateRangeToUtc, todayStrBangkok } from '@/lib/attendance-utils'
import {
  bangkokTodayYmdCompact,
  buildStoredPosOrderNo,
  normalizeStoreSlugForOrderNo,
  parseCompositeOrderNoSeq,
  parsePosDailyNumericOrderNo,
} from '@/lib/pos-order-no'
import { supabaseSelectFilter } from '@/lib/supabase-server'

const SELECT_LIMIT = 12000

function storeCodeQueryVariants(storeCode: string): string[] {
  const s = String(storeCode || '').trim()
  if (!s) return []
  const out = new Set<string>()
  out.add(s)
  const trimmed = s.replace(/^CM\s+/i, '').trim()
  if (trimmed && trimmed !== s) out.add(trimmed)
  if (!/^CM\s+/i.test(s) && trimmed) out.add(`CM ${trimmed}`)
  return [...out].filter(Boolean)
}

/** 다음 order_no (DB 저장 문자열) */
export async function allocateNextPosOrderNo(storeCode: string): Promise<string> {
  const ymd = bangkokTodayYmdCompact()
  const slug = normalizeStoreSlugForOrderNo(storeCode)
  const startStr = todayStrBangkok()
  const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, startStr)
  const variants = storeCodeQueryVariants(storeCode)
  let maxSeq = 0
  for (const sc of variants) {
    const filter = [
      `store_code=eq.${encodeURIComponent(sc)}`,
      `created_at=gte.${encodeURIComponent(startISO)}`,
      `created_at=lt.${encodeURIComponent(endISOExclusive)}`,
    ].join('&')
    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      limit: SELECT_LIMIT,
      select: 'order_no',
    })) as { order_no?: string }[] | null
    for (const r of rows || []) {
      const on = String(r.order_no ?? '')
      const c = parseCompositeOrderNoSeq(on, slug, ymd)
      if (c != null) {
        if (c > maxSeq) maxSeq = c
        continue
      }
      const p = parsePosDailyNumericOrderNo(on)
      if (p != null && p > maxSeq) maxSeq = p
    }
  }
  return buildStoredPosOrderNo(slug, ymd, maxSeq + 1)
}
