/**
 * POS 주문번호 할당 (서버 전용)
 * 저장 형식: 매장슬러그-YYYYMMDD-순번 (lib/pos-order-no.ts)
 * - YMD/순번은 매장의 **POS 영업일(operating day)** 기준으로 산출한다(자정이 아니라 영업 시작/마감 기준).
 *   예: 영업시간 11:00→익일 02:00 매장에서 자정 이후 주문도 동일 영업일로 묶여 #014, #015… 로 이어진다.
 * - `pos-business-day-server.ts`의 매장별 영업시간 설정을 사용. 미설정 시 전사 기본값.
 * 동시 다발 주문 시 순번 겹침 가능(드묾) → 필요 시 DB 시퀀스 RPC 권장.
 */

import {
  buildStoredPosOrderNo,
  normalizeStoreSlugForOrderNo,
  parseCompositeOrderNoSeq,
  parsePosDailyNumericOrderNo,
} from '@/lib/pos-order-no'
import {
  getPosBusinessDateStrFromConfig,
  posBusinessDateYmdToUtcRange,
} from '@/lib/pos-business-day'
import { loadPosBusinessHoursForServer } from '@/lib/pos-business-day-server'
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

/** 다음 order_no (DB 저장 문자열) — 영업일(operating day) 기준 */
export async function allocateNextPosOrderNo(storeCode: string): Promise<string> {
  const slug = normalizeStoreSlugForOrderNo(storeCode)
  const businessHours = await loadPosBusinessHoursForServer(storeCode)
  const businessDay = getPosBusinessDateStrFromConfig(new Date(), businessHours)
  const ymd = businessDay.replace(/-/g, '')
  const { startISO, endISOExclusive } = posBusinessDateYmdToUtcRange(businessDay, businessHours)
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
