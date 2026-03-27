import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { getStockLocationPatterns, isOfficeStockSelection } from '@/lib/stock-location-patterns'
import { bangkokInclusivePeriod, bangkokYmdRangeToIsoBounds, todayBangkokYmd } from '@/lib/bangkok-date'

/**
 * stock_logs 기간 소모량 합계 (품목코드별). 재고 발주 도움용.
 * - 본사(Office·입고등록 등): 주문/강제 출고로 본사 재고가 빠진 분량 → Outbound + ForceOutbound
 * - 매장: 사용 확정만 → Usage (POS 자동차감 제외)
 * location 패턴은 getAppData 와 동일 + 선택 매장명 원문.
 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const auth = await getVerifiedAuth(request)
  if (!auth) {
    return NextResponse.json({ success: false, message: '인증이 필요합니다.', usageByCode: {} }, { status: 401, headers })
  }

  const { searchParams } = new URL(request.url)
  const storeName = String(searchParams.get('storeName') || searchParams.get('store') || '').trim()
  const daysRaw = Number(searchParams.get('days') || 30)
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(366, Math.floor(daysRaw))) : 30
  const endYmdParam = String(searchParams.get('endDate') || '').trim()

  if (!storeName) {
    return NextResponse.json(
      { success: false, message: 'store required', usageByCode: {}, startYmd: '', endYmd: '', days },
      { headers }
    )
  }

  const officeMode = isOfficeStockSelection(storeName)
  const consumptionBasis = officeMode ? 'hq_outbound' : 'store_usage'
  const logTypes = officeMode ? (['Outbound', 'ForceOutbound'] as const) : (['Usage'] as const)

  const userRole = (auth.role || '').toLowerCase()
  const isManager = userRole.includes('manager') || userRole.includes('franchisee')
  const userStore = (auth.store || '').trim()
  if (isManager && userStore) {
    const storeNorm = storeName.toLowerCase().trim()
    const userNorm = userStore.toLowerCase().trim()
    const matches = storeNorm === userNorm || userNorm.includes(storeNorm) || storeNorm.includes(userNorm)
    if (!matches) {
      return NextResponse.json(
        {
          success: true,
          usageByCode: {},
          startYmd: '',
          endYmd: '',
          days,
          message: 'forbidden store',
          consumptionBasis,
        },
        { headers }
      )
    }
  }

  const endYmd = /^\d{4}-\d{2}-\d{2}$/.test(endYmdParam) ? endYmdParam : todayBangkokYmd()
  const { startYmd, endYmd: endYmd2 } = bangkokInclusivePeriod(endYmd, days)
  const { gteIso, lteIso } = bangkokYmdRangeToIsoBounds(startYmd, endYmd2)

  const patterns = getStockLocationPatterns(storeName)
  if (patterns.length === 0) {
    return NextResponse.json(
      { success: true, usageByCode: {}, startYmd, endYmd: endYmd2, days, consumptionBasis },
      { headers }
    )
  }

  const usageByCode: Record<string, number> = {}
  /** location·log_type 조합이 겹쳐도 동일 행은 한 번만 합산 */
  const seenRowIds = new Set<number>()

  try {
    for (const p of patterns) {
      for (const lt of logTypes) {
        const filter = [
          `log_type=eq.${lt}`,
          `location=ilike.${encodeURIComponent(p)}`,
          `log_date=gte.${encodeURIComponent(gteIso)}`,
          `log_date=lte.${encodeURIComponent(lteIso)}`,
        ].join('&')

        const rows = (await supabaseSelectFilterAllPages('stock_logs', filter, {
          select: 'id,item_code,qty',
          order: 'id.asc',
          pageSize: 8000,
          maxRows: 400000,
        })) as { id?: number; item_code?: string; qty?: number }[]

        for (const row of rows || []) {
          const rid = Number(row.id)
          if (Number.isFinite(rid) && rid > 0) {
            if (seenRowIds.has(rid)) continue
            seenRowIds.add(rid)
          }
          const code = String(row.item_code || '').trim()
          if (!code) continue
          const q = Math.abs(Number(row.qty) || 0)
          usageByCode[code] = (usageByCode[code] || 0) + q
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        usageByCode,
        startYmd,
        endYmd: endYmd2,
        days,
        consumptionBasis,
      },
      { headers }
    )
  } catch (e) {
    console.error('getStockUsageAggregate:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : String(e),
        usageByCode: {},
        startYmd,
        endYmd: endYmd2,
        days,
        consumptionBasis,
      },
      { status: 500, headers }
    )
  }
}
