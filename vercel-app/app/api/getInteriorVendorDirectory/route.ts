import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireInteriorTenantRead } from '@/lib/interior-tenant-guard'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
} from '@/lib/saas-tenant-scope'

/** 인테리어 업체 마스터 목록 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const guard = await requireInteriorTenantRead(request)
  if (!guard.ok) {
    guard.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return guard.errorResponse
  }

  if (isSaasTenantQueryBlocked(guard.scope, 'interior_vendor_directory')) {
    return NextResponse.json([], { headers })
  }

  const includeInactive = request.nextUrl.searchParams.get('includeInactive') === '1'

  try {
    const opts = { order: 'sort_order.asc,name.asc', limit: 5000 }
    const baseFilter = includeInactive ? 'id=gte.0' : 'is_active=eq.true'
    const filter = appendSaasTenantFilter(baseFilter, guard.scope, 'interior_vendor_directory')

    let rows: {
      id?: number
      code?: string
      name?: string
      contact_name?: string
      phone?: string
      email?: string
      address?: string
      specialty?: string
      memo?: string
      use_count?: number
      last_used_at?: string
      is_active?: boolean
      sort_order?: number
    }[] = []

    try {
      rows = (await supabaseSelectFilter('interior_vendor_directory', filter, opts)) as typeof rows
    } catch (e) {
      if (isMissingSaasTenantColumnError(e)) {
        markSaasTenantColumnMissing('interior_vendor_directory')
        rows = (await supabaseSelectFilter('interior_vendor_directory', baseFilter, opts)) as typeof rows
      } else {
        throw e
      }
    }

    const list = (rows || []).map((r) => ({
      id: r.id,
      code: String(r.code || '').trim(),
      name: String(r.name || '').trim(),
      contactName: String(r.contact_name || '').trim(),
      phone: String(r.phone || '').trim(),
      email: String(r.email || '').trim(),
      address: String(r.address || '').trim(),
      specialty: String(r.specialty || '').trim(),
      memo: String(r.memo || '').trim(),
      useCount: Number(r.use_count ?? 0),
      lastUsedAt: r.last_used_at ? String(r.last_used_at) : null,
      isActive: r.is_active !== false,
      sortOrder: Number(r.sort_order ?? 0),
    }))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorVendorDirectory:', e)
    return NextResponse.json([], { headers })
  }
}
