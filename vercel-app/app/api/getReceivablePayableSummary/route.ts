/**
 * 미수금/미지급금 잔액 요약
 * - type: receivable | payable
 * - DB RPC로 집계 (limit 없음, store/vendor별 1행만 반환)
 * - receivable: store_name으로 vendors 매칭(gps_name/name) → vendorCode, vendorName 포함
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseRpc, supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { storesMatchForGradeLookup } from '@/lib/grade-store-key-variants'

async function getStoreToVendorMap(): Promise<Map<string, { code: string; name: string }>> {
  const vendors = (await supabaseSelect('vendors', {
    select: 'code,name,gps_name',
    limit: 10000,
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
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth
  const { searchParams } = new URL(request.url)
  const type = String(searchParams.get('type') || 'receivable').trim().toLowerCase()
  const userStore = String(auth.store || '').trim()
  const userRole = String(auth.role || '').toLowerCase()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)
  const requestedStoreFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()
  const vendorFilter = String(searchParams.get('vendorFilter') || searchParams.get('vendor') || '').trim()
  const allowedStores =
    (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(userStore)

  const canSelectStores = isOfficeRole(userRole) || isAccountingRole(userRole)
  const isManager = (userRole.includes('manager') || userRole.includes('franchisee')) && !canSelectStores
  if (type === 'payable' && isManager) {
    return NextResponse.json({ type: 'payable', list: [] }, { headers })
  }

  try {
    if (type === 'payable') {
      const rows = (await supabaseRpc<{ vendor_code: string; balance: number; item_count: number }[]>(
        'get_payable_summary',
        {
          p_vendor_filter: vendorFilter || null,
          p_end_str: endStr || null,
        }
      )) as { vendor_code?: string; balance?: number; item_count?: number }[] | null

      const list = (rows || [])
        .map((r) => ({
          vendorCode: String(r.vendor_code ?? '').trim(),
          balance: Number(r.balance ?? 0),
          count: Number(r.item_count ?? 0),
        }))
        .filter((x) => x.vendorCode)
        .sort((a, b) => b.balance - a.balance)
      const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
      return NextResponse.json({ type: 'payable', list, totalAmount }, { headers })
    }

    // receivable
    let storeFilterVal = requestedStoreFilter
    if (!canSelectStores) {
      if (!requestedStoreFilter || requestedStoreFilter === 'All' || requestedStoreFilter === '전체') {
        storeFilterVal = String(allowedStores[0] || '').trim()
      } else {
        const allowed = allowedStores.some((s) => storesMatchForGradeLookup(s, requestedStoreFilter))
        if (!allowed) {
          return NextResponse.json({ error: 'FORBIDDEN_STORE_SCOPE' }, { status: 403, headers })
        }
      }
    }
    const rows = (await supabaseRpc<{ store_name: string; balance: number; item_count: number }[]>(
      'get_receivable_summary',
      {
        p_store_filter: storeFilterVal || null,
        p_end_str: endStr || null,
      }
    )) as { store_name?: string; balance?: number; item_count?: number }[] | null

    const storeToVendor = await getStoreToVendorMap()
    const list = (rows || [])
      .map((r) => {
        const storeName = String(r.store_name ?? '').trim()
        const vendor = storeToVendor.get(storeName)
        return {
          storeName,
          vendorCode: vendor?.code,
          vendorName: vendor?.name,
          balance: Number(r.balance ?? 0),
          count: Number(r.item_count ?? 0),
        }
      })
      .filter((x) => x.storeName)
      .sort((a, b) => b.balance - a.balance)
    const totalAmount = list.reduce((sum, i) => sum + (i.balance ?? 0), 0)
    return NextResponse.json({ type: 'receivable', list, totalAmount }, { headers })
  } catch (_rpcErr) {
    try {
      // RPC 미배포 시 fallback: 기존 select + JS 집계
      const pParts: string[] = []
      if (vendorFilter) pParts.push(`vendor_code=ilike.${encodeURIComponent(vendorFilter)}`)
      if (endStr) pParts.push(`trans_date=lte.${endStr}`)
      const pFilter = pParts.length ? pParts.join('&') : 'id=gt.0'

      const rParts: string[] = []
      if (!canSelectStores) {
        const scopeStore = (!requestedStoreFilter || requestedStoreFilter === 'All' || requestedStoreFilter === '전체')
          ? String(allowedStores[0] || '').trim()
          : requestedStoreFilter
        if (scopeStore) rParts.push(`store_name=ilike.${encodeURIComponent(scopeStore)}`)
      } else if (requestedStoreFilter) {
        rParts.push(`store_name=ilike.${encodeURIComponent(requestedStoreFilter)}`)
      }
      if (endStr) rParts.push(`trans_date=lte.${endStr}`)
      const rFilter = rParts.length ? rParts.join('&') : 'id=gt.0'

      const rows =
        type === 'payable'
          ? ((await supabaseSelectFilter('payable_transactions', pFilter, {
              order: 'trans_date.desc',
              limit: 20000,
            })) as { vendor_code?: string; amount?: number }[])
          : ((await supabaseSelectFilter('receivable_transactions', rFilter, {
              order: 'trans_date.desc',
              limit: 20000,
            })) as { store_name?: string; amount?: number }[])

      if (type === 'payable') {
        const byVendor: Record<string, { balance: number; count: number }> = {}
        const payableRows = (rows || []) as { vendor_code?: string; amount?: number }[]
        for (const r of payableRows) {
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

      const byStore: Record<string, { balance: number; count: number }> = {}
      const receivableRows = (rows || []) as { store_name?: string; amount?: number }[]
      for (const r of receivableRows) {
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
}
