/**
 * 캠페인별 회계 비용 집계
 * campaignId 필수.
 * bank_transactions (출금), petty_cash_transactions (지출)에서 memo에 캠페인명 포함 시 합산.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

function memoMatchesTopic(memo: string, topic: string): boolean {
  const m = String(memo || '').trim().toLowerCase()
  const t = String(topic || '').trim().toLowerCase()
  if (!t) return false
  return m.includes(t)
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const { searchParams } = new URL(request.url)
    const campaignId = searchParams.get('campaignId')?.trim()

    if (!campaignId) {
      return NextResponse.json({ success: false, message: 'campaignId 필요' }, { headers })
    }

    const campaignRows = (await supabaseSelectFilter('marketing_campaigns', `id=eq.${campaignId}`, {
      limit: 1,
      select: 'topic,start_date,end_date',
    })) as { topic?: string; start_date?: string; end_date?: string }[]
    const campaign = campaignRows[0]
    if (!campaign) {
      return NextResponse.json({ success: false, message: '캠페인을 찾을 수 없습니다.' }, { headers })
    }

    const topic = String(campaign.topic || '').trim()
    const startDate = campaign.start_date ? String(campaign.start_date).slice(0, 10) : null
    const endDate = campaign.end_date ? String(campaign.end_date).slice(0, 10) : null

    if (!startDate || !endDate) {
      return NextResponse.json(
        {
          success: true,
          campaignId,
          topic,
          bankCosts: 0,
          pettyCosts: 0,
          totalCosts: 0,
          message: '캠페인 기간이 없어 집계하지 않았습니다.',
        },
        { headers }
      )
    }

    let bankCosts = 0
    let pettyCosts = 0

    try {
      const bankAccRows = (await supabaseSelect('bank_accounts', { select: 'id', limit: 200 })) as { id?: number }[]
      const accountIds = (bankAccRows || []).map((a) => a.id).filter((id): id is number => id != null)
      if (accountIds.length > 0) {
        const idList = accountIds.join(',')
        const filter = `account_id=in.(${idList})&trans_date=gte.${startDate}&trans_date=lte.${endDate}&trans_type=eq.withdraw`
        const btRows = (await supabaseSelectFilter('bank_transactions', filter, {
          select: 'amount,memo',
          limit: 5000,
        })) as { amount?: number; memo?: string }[]
        for (const r of btRows || []) {
          if (memoMatchesTopic(r.memo ?? '', topic)) {
            bankCosts += Math.abs(Number(r.amount) || 0)
          }
        }
      }
    } catch {
      /* bank_transactions 없을 수 있음 */
    }

    try {
      const filter = `trans_date=gte.${startDate}&trans_date=lte.${endDate}&trans_type=eq.expense`
      const pettyRows = (await supabaseSelectFilter('petty_cash_transactions', filter, {
        select: 'amount,memo',
        limit: 5000,
      })) as { amount?: number; memo?: string }[]
      for (const r of pettyRows || []) {
        if (memoMatchesTopic(r.memo ?? '', topic)) {
          pettyCosts += Math.abs(Number(r.amount) || 0)
        }
      }
    } catch {
      /* petty_cash_transactions 없을 수 있음 */
    }

    const totalCosts = bankCosts + pettyCosts

    return NextResponse.json(
      {
        success: true,
        campaignId,
        topic,
        startDate,
        endDate,
        bankCosts,
        pettyCosts,
        totalCosts,
      },
      { headers }
    )
  } catch (e) {
    console.error('marketingCampaignCosts:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '집계 실패' },
      { headers }
    )
  }
}
