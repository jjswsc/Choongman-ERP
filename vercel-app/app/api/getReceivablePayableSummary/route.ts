/**
 * 미수금/미지급금 잔액 요약
 * - type: receivable | payable
 * - startStr, endStr: trans_date 기간 필터
 * - storeFilter: 매장 필터 (receivable)
 * - vendorFilter: 거래처 필터 (payable)
 * - store_name / vendor_code별 SUM(amount), 거래 건수, 잔액 큰 순 정렬
 * - receivable: store_name으로 vendors 매칭(gps_name/name) → vendorCode, vendorName 포함
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'

async function getStoreToVendorMap(): Promise<Map<string, { code: string; name: string }>> {
  const vendors = (await supabaseSelect('vendors', {
    select: 'code,name,gps_name',
    limit: 5000,
  })) as { code?: string; name?: string; gps_name?: string }[] | null
  const map = new Map<string, { code: string; name: string }>()
  for (const v of vendors || []) {
    const code = String(v.code || '').trim()
    const name = String(v.name || '').trim() || code
    const gpsName = String(v.gps_name || '').trim()
    if (!code) continue
    const entry = { code, name }
    if (gpsName) map.set(gpsName, entry)
    if (name && !map.has(name)) map.set(name, entry)
    if (gpsName && gpsName.startsWith('CM ')) map.set(gpsName.slice(3).trim(), entry)
    if (gpsName && !gpsName.startsWith('CM ')) map.set('CM ' + gpsName, entry)
  }
  return map
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const type = String(searchParams.get('type') || 'receivable').trim().toLowerCase()
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim().slice(0, 10)
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const vendorFilter = String(searchParams.get('vendorFilter') || searchParams.get('vendor') || '').trim()

  const isManager = userRole.includes('manager') || userRole.includes('franchisee')
  if (type === 'payable' && isManager) {
    return NextResponse.json({ type: 'payable', list: [] }, { headers })
  }

  try {
    if (type === 'payable') {
      const pParts: string[] = []
      if (vendorFilter) pParts.push(`vendor_code=ilike.${encodeURIComponent(vendorFilter)}`)
      // 요약 잔액은 endStr 기준 누적으로 계산
      if (endStr) pParts.push(`trans_date=lte.${endStr}`)
      const pFilter = pParts.length ? pParts.join('&') : 'id=gt.0'
      const rows = (await supabaseSelectFilter(
        'payable_transactions',
        pFilter,
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
      const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
      return NextResponse.json({ type: 'payable', list, totalAmount }, { headers })
    }

    // receivable
    const rParts: string[] = []
    if (isManager && userStore) {
      rParts.push(`store_name=ilike.${encodeURIComponent(userStore)}`)
    } else if (storeFilter) {
      rParts.push(`store_name=ilike.${encodeURIComponent(storeFilter)}`)
    }
    // 요약 잔액은 endStr 기준 누적으로 계산
    if (endStr) rParts.push(`trans_date=lte.${endStr}`)
    const rFilter = rParts.length ? rParts.join('&') : 'id=gt.0'
    const rows = (await supabaseSelectFilter(
      'receivable_transactions',
      rFilter,
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

    const storeToVendor = await getStoreToVendorMap()
    const list = Object.entries(byStore)
      .map(([storeName, v]) => {
        const vendor = storeToVendor.get(storeName)
        return {
          storeName,
          vendorCode: vendor?.code,
          vendorName: vendor?.name,
          balance: v.balance,
          count: v.count,
        }
      })
      .sort((a, b) => b.balance - a.balance)
    const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
    return NextResponse.json({ type: 'receivable', list, totalAmount }, { headers })
  } catch (e) {
    console.error('getReceivablePayableSummary:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed' },
      { status: 500, headers }
    )
  }
}
