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
import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import { normalizeTenantId } from '@/lib/tenant-context'

const SELECT_LIMIT = 12000

export function storeCodeQueryVariants(storeCode: string): string[] {
  const s = String(storeCode || '').trim()
  if (!s) return []
  const out = new Set<string>()
  out.add(s)
  const trimmed = s.replace(/^CM\s+/i, '').trim()
  if (trimmed && trimmed !== s) out.add(trimmed)
  if (!/^CM\s+/i.test(s) && trimmed) out.add(`CM ${trimmed}`)
  return [...out].filter(Boolean)
}

export type AllocatePosOrderNoOpts = {
  /** Omni: 테넌트별 카운터 분리. 충만은 '' */
  tenantId?: string | null
}

/** 다음 order_no (DB 저장 문자열) — 영업일(operating day) 기준 */
export async function allocateNextPosOrderNo(
  storeCode: string,
  opts?: AllocatePosOrderNoOpts
): Promise<string> {
  const slug = normalizeStoreSlugForOrderNo(storeCode)
  const tenantId = normalizeTenantId(opts?.tenantId) || ''
  const businessHours = await loadPosBusinessHoursForServer(storeCode)
  const businessDay = getPosBusinessDateStrFromConfig(new Date(), businessHours)
  const ymd = businessDay.replace(/-/g, '')
  /**
   * 1) RPC 우선: 동시 주문에서도 원자적으로 순번 증가
   * 2) RPC 미배포/오류 시 기존 select+scan fallback
   */
  try {
    const rpcOut = await supabaseRpc<string>('allocate_pos_order_no', {
      p_store_slug: slug,
      p_business_ymd: ymd,
      p_tenant_id: tenantId,
    })
    const orderNo = String(rpcOut ?? '').trim()
    if (orderNo) return orderNo
  } catch {
    /* 3인자 RPC 미배포 → 2인자 폴백 */
    try {
      const rpcOut = await supabaseRpc<string>('allocate_pos_order_no', {
        p_store_slug: slug,
        p_business_ymd: ymd,
      })
      const orderNo = String(rpcOut ?? '').trim()
      if (orderNo) return orderNo
    } catch {
      /* fallback below */
    }
  }
  const { startISO, endISOExclusive } = posBusinessDateYmdToUtcRange(businessDay, businessHours)
  const variants = storeCodeQueryVariants(storeCode)
  let maxSeq = 0
  for (const sc of variants) {
    const parts = [
      `store_code=eq.${encodeURIComponent(sc)}`,
      `created_at=gte.${encodeURIComponent(startISO)}`,
      `created_at=lt.${encodeURIComponent(endISOExclusive)}`,
    ]
    if (tenantId) {
      parts.push(`tenant_id=eq.${encodeURIComponent(tenantId)}`)
    }
    const rows = (await supabaseSelectFilter('pos_orders', parts.join('&'), {
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
