/**
 * 미수금/미지급금 목록 조회
 * - type: receivable | payable
 * - storeFilter / vendorFilter (선택)
 * - startStr, endStr (trans_date 범위)
 * - receivable: store_name으로 vendors 매칭 → vendorCode, vendorName 포함
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
  let storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const vendorFilter = searchParams.get('vendorFilter') || searchParams.get('vendor') || ''
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim().slice(0, 10)
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  const userStore = String(searchParams.get('userStore') || '').trim()
  const userRole = String(searchParams.get('userRole') || '').toLowerCase()

  // 매니저/가맹점주: receivable는 자기 매장만, payable은 조회 불가
  const isManager = userRole.includes('manager') || userRole.includes('franchisee')
  if (type === 'receivable' && isManager && userStore) {
    storeFilter = userStore
  }
  if (type === 'payable' && isManager) {
    return NextResponse.json({ type: 'payable', list: [] }, { headers })
  }

  try {
    if (type === 'payable') {
      const parts: string[] = []
      if (vendorFilter) parts.push(`vendor_code=ilike.${encodeURIComponent(vendorFilter)}`)
      // 잔액/누적 조회 기준: endStr(조회 종료일)까지 누적
      if (endStr) parts.push(`trans_date=lte.${endStr}`)
      const filter = parts.length ? parts.join('&') : 'id=gt.0'
      let rows = (await supabaseSelectFilter(
        'payable_transactions',
        filter,
        { order: 'trans_date.desc', limit: 1000 }
      )) as { id?: number; vendor_code?: string; amount?: number; ref_type?: string; ref_id?: number; trans_date?: string; memo?: string; created_at?: string }[]

      // 매장별 필터: 입고(Inbound) 건은 inbound_batches.location으로 필터
      if (storeFilter && (rows || []).length > 0) {
        const inboundIds = (rows || [])
          .filter((r) => r.ref_type === 'Inbound' && r.ref_id != null)
          .map((r) => Number(r.ref_id))
        let batchIdsForStore: number[] = []
        if (inboundIds.length > 0) {
          const batches = (await supabaseSelectFilter(
            'inbound_batches',
            `id=in.(${inboundIds.join(',')})`,
            { select: 'id,location', limit: 1000 }
          )) as { id?: number; location?: string }[] | null
          const storeNorm = storeFilter.trim().toLowerCase()
          batchIdsForStore = (batches || [])
            .filter((b) => {
              const loc = String(b.location || '').trim().toLowerCase()
              return loc === storeNorm || loc.includes(storeNorm) || storeNorm.includes(loc)
            })
            .map((b) => Number(b.id)).filter((id) => !isNaN(id))
        }
        const batchIdSet = new Set(batchIdsForStore)
        rows = (rows || []).filter((r) => {
          if (r.ref_type === 'Inbound' && r.ref_id != null) {
            return batchIdSet.has(Number(r.ref_id))
          }
          // PO, Payment, Opening 등: 매장 정보 없으면 전체 포함 (본사/공통)
          return true
        })
      }

      const byVendor: Record<string, { total: number; items: typeof rows }> = {}
      for (const r of rows || []) {
        const vc = String(r.vendor_code || '').trim()
        if (!vc) continue
        if (!byVendor[vc]) byVendor[vc] = { total: 0, items: [] }
        byVendor[vc].items.push(r)
        byVendor[vc].total += Number(r.amount ?? 0)
      }

      const list = Object.entries(byVendor).map(([vendorCode, v]) => ({
        vendorCode,
        balance: v.total,
        items: v.items.sort((a, b) => (String(b.trans_date || '').localeCompare(String(a.trans_date || '')))),
      }))

      return NextResponse.json({ type: 'payable', list }, { headers })
    }

    // receivable
    const parts: string[] = []
    if (storeFilter) parts.push(`store_name=ilike.${encodeURIComponent(storeFilter)}`)
    // 잔액/누적 조회 기준: endStr(조회 종료일)까지 누적
    if (endStr) parts.push(`trans_date=lte.${endStr}`)
    const filter = parts.length ? parts.join('&') : 'id=gt.0'
    const rows = (await supabaseSelectFilter(
      'receivable_transactions',
      filter,
      { order: 'trans_date.desc', limit: 1000 }
    )) as { id?: number; store_name?: string; amount?: number; ref_type?: string; ref_id?: number; trans_date?: string; memo?: string; invoice_no?: string; created_at?: string }[]

    const byStore: Record<string, { total: number; items: typeof rows }> = {}
    for (const r of rows || []) {
      const sn = String(r.store_name || '').trim()
      if (!sn) continue
      if (!byStore[sn]) byStore[sn] = { total: 0, items: [] }
      byStore[sn].items.push(r)
      byStore[sn].total += Number(r.amount ?? 0)
    }

    const storeToVendor = await getStoreToVendorMap()
    const list = Object.entries(byStore).map(([storeName, v]) => {
      const vendor = storeToVendor.get(storeName)
      return {
        storeName,
        vendorCode: vendor?.code,
        vendorName: vendor?.name,
        balance: v.total,
        items: v.items.sort((a, b) => (String(b.trans_date || '').localeCompare(String(a.trans_date || '')))),
      }
    })

    return NextResponse.json({ type: 'receivable', list }, { headers })
  } catch (e) {
    console.error('getReceivablePayableList:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed' },
      { status: 500, headers }
    )
  }
}
