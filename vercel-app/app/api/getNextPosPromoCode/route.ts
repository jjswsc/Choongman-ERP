import { NextRequest, NextResponse } from 'next/server'
import { allocateNextPromoCodeForCampaign } from '@/lib/marketing-promo-code'

/**
 * 다음 프로모션 세트 코드 (캠페인 고유번호 기준).
 * ?campaignId= 필수 — 캠페인 허브에서 연 캠페인만 코드 발급.
 */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const campaignId = req.nextUrl.searchParams.get('campaignId')?.trim()
    if (!campaignId) {
      return NextResponse.json(
        { code: null, message: 'campaignId가 필요합니다. 캠페인을 선택하세요.' },
        { status: 400, headers }
      )
    }
    const id = Number(campaignId)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ code: null, message: '유효하지 않은 campaignId입니다.' }, { status: 400, headers })
    }
    const code = await allocateNextPromoCodeForCampaign(id)
    return NextResponse.json({ code }, { headers })
  } catch (e) {
    console.error('getNextPosPromoCode:', e)
    return NextResponse.json(
      { code: null, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
