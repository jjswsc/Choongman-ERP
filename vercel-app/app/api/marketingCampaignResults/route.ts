/**
 * 캠페인별 POS 실적 집계
 * campaignId, importId 필수.
 * pos_sales_details에서 기간·지점·채널 매칭 후 Dine in / Delivery / Carry out별 주문 수·매출 반환.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function isDeliveryChannel(ch: string): boolean {
  const c = String(ch || '').trim()
  return /^(Grab|Lineman|Shopee|Robinhood)/i.test(c)
}

function isDineInChannel(ch: string): boolean {
  const c = String(ch || '').trim()
  return /^Table\s/i.test(c)
}

function isCarryOutChannel(ch: string): boolean {
  const c = String(ch || '').trim()
  return /^Packing\s/i.test(c)
}

function posMatchesBranch(pos: string, branches: string[]): boolean {
  if (!branches?.length) return true
  const p = String(pos || '').toLowerCase().trim()
  if (!p) return false
  return branches.some((b) => String(b || '').toLowerCase().trim() === p || p.includes(String(b).toLowerCase()))
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('campaignId')?.trim()
    const importId = searchParams.get('importId')?.trim()

    if (!campaignId || !importId) {
      return NextResponse.json(
        { success: false, message: 'campaignId, importId 필요' },
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

    let filter = `import_id=eq.${encodeURIComponent(importId)}&payment_amount=gt.0`
    if (startDate) filter += `&sales_datetime=gte.${startDate}T00:00:00Z`
    if (endDate) filter += `&sales_datetime=lte.${endDate}T23:59:59Z`

    const rows = (await supabaseSelectFilter('pos_sales_details', filter, {
      limit: 50000,
      select: 'channel,pos,payment_amount',
    })) as { channel?: string; pos?: string; payment_amount?: number }[]

    let dineInOrders = 0
    let deliveryOrders = 0
    let carryOutOrders = 0
    let dineInSales = 0
    let deliverySales = 0
    let carryOutSales = 0

    for (const r of rows) {
      if (!posMatchesBranch(r.pos ?? '', branches)) continue

      const amt = Number(r.payment_amount) || 0
      const ch = r.channel ?? ''

      if (isDineInChannel(ch)) {
        dineInOrders++
        dineInSales += amt
      } else if (isDeliveryChannel(ch)) {
        deliveryOrders++
        deliverySales += amt
      } else if (isCarryOutChannel(ch)) {
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
        importId,
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
