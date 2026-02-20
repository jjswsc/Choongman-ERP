/**
 * 미수금/미지급금 잔액 요약 (기간 필터 없음, 전체 누적 잔액)
 * - type: receivable | payable
 * - store_name / vendor_code별 SUM(amount), 거래 건수
 * - 잔액 큰 순 정렬
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const type = String(searchParams.get('type') || 'receivable').trim().toLowerCase()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()

  const isManager = userRole.includes('manager') || userRole.includes('franchisee')
  if (type === 'payable' && isManager) {
    return NextResponse.json({ type: 'payable', list: [] }, { headers })
  }

  try {
    if (type === 'payable') {
      const rows = (await supabaseSelectFilter(
        'payable_transactions',
        'id=gt.0',
        { order: 'trans_date.desc', limit: 5000 }
      )) as { id?: number; vendor_code?: string; amount?: number }[]

      const byVendor: Record<string, { balance: number; count: number }> = {}
      for (const r of rows || []) {
        const vc = String(r.vendor_code || '').trim()
        if (!vc) continue
        if (!byVendor[vc]) byVendor[vc] = { balance: 0, count: 0 }
        byVendor[vc].balance += Number(r.amount ?? 0)
        byVendor[vc].count += 1
      }

      const list = Object.entries(byVendor)
        .map(([vendorCode, v]) => ({ vendorCode, balance: v.balance, count: v.count }))
        .sort((a, b) => b.balance - a.balance)

      return NextResponse.json({ type: 'payable', list }, { headers })
    }

    // receivable
    let filter = 'id=gt.0'
    if (isManager && userStore) {
      filter = `store_name=ilike.${encodeURIComponent(userStore)}`
    }

    const rows = (await supabaseSelectFilter(
      'receivable_transactions',
      filter,
      { order: 'trans_date.desc', limit: 5000 }
    )) as { id?: number; store_name?: string; amount?: number }[]

    const byStore: Record<string, { balance: number; count: number }> = {}
    for (const r of rows || []) {
      const sn = String(r.store_name || '').trim()
      if (!sn) continue
      if (!byStore[sn]) byStore[sn] = { balance: 0, count: 0 }
      byStore[sn].balance += Number(r.amount ?? 0)
      byStore[sn].count += 1
    }

    const list = Object.entries(byStore)
      .map(([storeName, v]) => ({ storeName, balance: v.balance, count: v.count }))
      .sort((a, b) => b.balance - a.balance)

    return NextResponse.json({ type: 'receivable', list }, { headers })
  } catch (e) {
    console.error('getReceivablePayableSummary:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed' },
      { status: 500, headers }
    )
  }
}
