import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'

/** 인테리어 업체 마스터 목록 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const includeInactive = request.nextUrl.searchParams.get('includeInactive') === '1'

  try {
    const opts = { order: 'sort_order.asc,name.asc', limit: 5000 }
    const rows = (includeInactive
      ? await supabaseSelect('interior_vendor_directory', opts)
      : await supabaseSelectFilter('interior_vendor_directory', 'is_active=eq.true', opts)) as {
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
    }[]

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
