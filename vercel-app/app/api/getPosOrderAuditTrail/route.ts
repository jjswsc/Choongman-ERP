import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { isOfficeRole } from '@/lib/permissions'
import { getBangkokDateRangeUtc, getBangkokTodayDateString } from '@/lib/bangkok-time'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function sanitizeYmd(v: string): string {
  const s = String(v || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return ''
  return s
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const auth = authResult.auth

  const { searchParams } = new URL(request.url)
  const today = getBangkokTodayDateString()
  const startStr = sanitizeYmd(String(searchParams.get('startStr') || searchParams.get('start') || today))
  const endStr = sanitizeYmd(String(searchParams.get('endStr') || searchParams.get('end') || today))
  const employee = String(searchParams.get('employee') || '').trim()
  const orderNo = String(searchParams.get('orderNo') || '').trim()
  const store = String(searchParams.get('store') || '').trim()
  const limitRaw = Number(searchParams.get('limit') || 500)
  const limit = Math.max(1, Math.min(Number.isFinite(limitRaw) ? Math.floor(limitRaw) : 500, 3000))

  const filters: string[] = []
  if (startStr && endStr) {
    const { dayStartUtcIso, nextDayStartUtcIso } = getBangkokDateRangeUtc(startStr, endStr)
    filters.push(`changed_at=gte.${encodeURIComponent(dayStartUtcIso)}`)
    filters.push(`changed_at=lt.${encodeURIComponent(nextDayStartUtcIso)}`)
  }
  if (orderNo) filters.push(`order_no=ilike.*${encodeURIComponent(orderNo)}*`)
  if (employee) {
    const encoded = encodeURIComponent(`*${employee}*`)
    filters.push(`or=(changed_by.ilike.${encoded},changed_by_employee_code.ilike.${encoded})`)
  }

  const roleRaw = String(auth.role || '')
  const office = isOfficeRole(roleRaw)
  const authStore = String(auth.store || '').trim()
  const allowedStores = Array.from(
    new Set(
      (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
        .map((s) => String(s || '').trim())
        .concat(authStore)
        .filter(Boolean)
    )
  )

  if (office) {
    if (store && store !== 'All') filters.push(`store_code=eq.${encodeURIComponent(store)}`)
  } else if (allowedStores.length === 1) {
    filters.push(`store_code=eq.${encodeURIComponent(allowedStores[0])}`)
  } else if (allowedStores.length > 1) {
    filters.push(`store_code=in.(${allowedStores.map((s) => encodeURIComponent(s)).join(',')})`)
  }

  const filterStr = filters.length ? filters.join('&') : 'id=gt.0'
  try {
    const rows = (await supabaseSelectFilter('pos_order_audit_logs', filterStr, {
      order: 'changed_at.desc,id.desc',
      limit,
      select:
        'id,changed_at,order_id,order_no,store_code,action_type,changed_by,changed_by_role,changed_by_store,changed_by_employee_code,changed_by_employee_id,change_source,reason,before_json,after_json,changed_fields_json',
    })) as Record<string, unknown>[]
    return NextResponse.json({ success: true, rows: Array.isArray(rows) ? rows : [] }, { headers })
  } catch (e) {
    const msg = String(e || '')
    if (msg.toLowerCase().includes('pos_order_audit_logs') || msg.includes('42P01')) {
      return NextResponse.json({ success: true, rows: [] }, { headers })
    }
    console.error('getPosOrderAuditTrail:', e)
    return NextResponse.json({ success: false, message: msg.slice(0, 500), rows: [] }, { headers })
  }
}
