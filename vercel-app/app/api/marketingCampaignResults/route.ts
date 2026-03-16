/**
 * 캠페인별 POS 실적 집계
 * campaignId 필수. pos_orders에서 캠페인 기간·지점 매칭 후 매출 반환.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

function posMatchesBranch(storeCode: string, branches: string[]): boolean {
  if (!branches?.length) return true
  const p = String(storeCode || '').toLowerCase().trim()
  if (!p) return false
  return branches.some(
    (b) => String(b || '').toLowerCase().trim() === p || p.includes(String(b).toLowerCase())
  )
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('campaignId')?.trim()

    if (!campaignId) {
      return NextResponse.json(
        { success: false, message: 'campaignId 필요' },
        { headers }
      )
    }

    const campaignRows = (await supabaseSelectFilter('marketing_campaigns', `id=eq.${campaignId}`, {
      limit: 1,
      select: 'start_date,end_date,branches',
    })) as { start_date?: string; end_date?: string; branches?: string[] }[]
    const campaign = campaignRows[0]
    if (!campaign) {
      return NextResponse.json({ success: false, message: '캠페인을 찾을 수 없습니다.' }, { headers })
    }

    const startDate = campaign.start_date ? String(campaign.start_date).slice(0, 10) : null
    const endDate = campaign.end_date ? String(campaign.end_date).slice(0, 10) : null
    const branches = Array.isArray(campaign.branches) ? campaign.branches : []

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: true, campaignId, startDate, endDate, dineInOrders: 0, deliveryOrders: 0, carryOutOrders: 0, totalOrders: 0, dineInSales: 0, deliverySales: 0, carryOutSales: 0, totalSales: 0 },
        { headers }
      )
    }

    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startDate, endDate)
    const filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`

    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      limit: 50000,
      select: 'order_type,total,store_code,status',
    })) as { order_type?: string; total?: number; store_code?: string; status?: string }[]

    let dineInOrders = 0
    let deliveryOrders = 0
    let carryOutOrders = 0
    let dineInSales = 0
    let deliverySales = 0
    let carryOutSales = 0

    for (const r of rows) {
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      if (!posMatchesBranch(r.store_code ?? '', branches)) continue

      const amt = Number(r.total) || 0
      const orderType = String(r.order_type ?? '').toLowerCase()

      if (orderType === 'dine_in') {
        dineInOrders++
        dineInSales += amt
      } else if (orderType === 'delivery') {
        deliveryOrders++
        deliverySales += amt
      } else if (orderType === 'takeout') {
        carryOutOrders++
        carryOutSales += amt
      }
    }

    const totalOrders = dineInOrders + deliveryOrders + carryOutOrders
    const totalSales = dineInSales + deliverySales + carryOutSales

    return NextResponse.json(
      {
        success: true,
        campaignId,
        startDate,
        endDate,
        dineInOrders,
        deliveryOrders,
        carryOutOrders,
        totalOrders,
        dineInSales,
        deliverySales,
        carryOutSales,
        totalSales,
      },
      { headers }
    )
  } catch (e) {
    console.error('marketingCampaignResults:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '집계 실패' },
      { headers }
    )
  }
}
