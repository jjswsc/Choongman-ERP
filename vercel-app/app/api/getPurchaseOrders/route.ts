import { NextRequest } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import { requireAuth } from '@/lib/verify-auth'
import { isAccountingRole, isOfficeRole } from '@/lib/permissions'
import { parsePurchaseOrderCart } from '@/lib/purchase-order-cart'
import { canAccessAccountingPoForAuth } from '@/lib/po-issuer-scope'

/** 본사·매장 발주 내역 조회 (기간, 거래처 필터 지원). 기간은 방콕 달력 기준. */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const userRole = String(auth.role || '').trim()
    const userStore = String(auth.store || '').trim()
    const isScopedRole = !isOfficeRole(userRole) && !isAccountingRole(userRole)

    const { searchParams } = new URL(request.url)
    const vendorCode = String(searchParams.get('vendorCode') || '').trim()
    const poId = Number(searchParams.get('poId') || searchParams.get('id') || 0)
    const startDate = String(searchParams.get('startDate') || '').trim()
    const endDate = String(searchParams.get('endDate') || '').trim()

    const parts: string[] = []
    if (poId && !isNaN(poId)) {
      parts.push(`id=eq.${poId}`)
    } else {
      parts.push('id=gt.0')
      if (vendorCode) parts.push(`vendor_code=eq.${encodeURIComponent(vendorCode)}`)
      const startStr = startDate.slice(0, 10)
      const endStr = endDate.slice(0, 10)
      if (startStr && endStr) {
        const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
        parts.push(`created_at=gte.${encodeURIComponent(startISO)}`)
        parts.push(`created_at=lt.${encodeURIComponent(endISOExclusive)}`)
      } else if (startStr) {
        const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, startStr)
        parts.push(`created_at=gte.${encodeURIComponent(startISO)}`)
        parts.push(`created_at=lt.${encodeURIComponent(endISOExclusive)}`)
      } else if (endStr) {
        const { startISO, endISOExclusive } = bangkokDateRangeToUtc(endStr, endStr)
        parts.push(`created_at=gte.${encodeURIComponent(startISO)}`)
        parts.push(`created_at=lt.${encodeURIComponent(endISOExclusive)}`)
      }
    }
    const filter = parts.join('&')
    const rows = (await supabaseSelectFilter(
      'purchase_orders',
      filter,
      { order: 'created_at.desc', limit: 500 }
    )) as {
      id?: number
      po_no?: string
      vendor_code?: string
      vendor_name?: string
      location_name?: string
      location_address?: string
      location_code?: string
      cart_json?: string
      subtotal?: number
      vat?: number
      total?: number
      user_name?: string
      status?: string
      created_at?: string
    }[]

    const filtered = isScopedRole
      ? (rows || []).filter((po) => {
          const { meta } = parsePurchaseOrderCart(po.cart_json)
          return canAccessAccountingPoForAuth({
            role: userRole,
            store: userStore,
            issuerStore: meta?.issuerStore,
            relatedStore: meta?.relatedStore,
          })
        })
      : rows || []

    return Response.json(filtered, { headers })
  } catch (e) {
    console.error('getPurchaseOrders:', e)
    return Response.json(
      { error: e instanceof Error ? e.message : 'Failed' },
      { status: 500, headers }
    )
  }
}
