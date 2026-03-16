import { NextRequest, NextResponse } from 'next/server'
import { getDepreciableAssetsForMonth, runDepreciationForMonth } from '@/lib/depreciation-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const yearMonth = searchParams.get('yearMonth') || ''
  const storeFilter = searchParams.get('storeFilter') || ''

  try {
    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ success: false, message: 'yearMonth(YYYY-MM)가 필요합니다.' }, { status: 400, headers })
    }

    const candidates = await getDepreciableAssetsForMonth(yearMonth)
    const filtered =
      storeFilter && storeFilter !== 'All'
        ? candidates.filter((c) => c.store_name === storeFilter)
        : candidates
    const toProcess = filtered.filter((c) => !c.already_posted)

    return NextResponse.json(
      {
        success: true,
        yearMonth,
        storeFilter: storeFilter || 'All',
        candidates: toProcess.map((a) => ({
          id: a.id,
          asset_code: a.asset_code,
          name: a.name,
          store_name: a.store_name,
          monthly_amount: a.monthly_amount,
        })),
        totalAmount: toProcess.reduce((s, a) => s + a.monthly_amount, 0),
      },
      { headers }
    )
  } catch (e) {
    console.error('runDepreciation GET:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json().catch(() => ({}))
    const yearMonth = String(body.yearMonth || '').trim()
    const storeFilter = String(body.storeFilter || '').trim()
    const dryRun = Boolean(body.dryRun)

    if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) {
      return NextResponse.json({ success: false, message: 'yearMonth(YYYY-MM)가 필요합니다.' }, { status: 400, headers })
    }

    const result = await runDepreciationForMonth({
      yearMonth,
      storeFilter: storeFilter || undefined,
      dryRun,
    })

    return NextResponse.json(
      {
        success: true,
        yearMonth,
        dryRun,
        created: result.created,
        totalAmount: result.totalAmount,
        message: dryRun
          ? `${result.created}건 예상 (합계 ฿${result.totalAmount.toLocaleString()})`
          : `${result.created}건 분개되었습니다.`,
      },
      { headers }
    )
  } catch (e) {
    console.error('runDepreciation POST:', e)
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
