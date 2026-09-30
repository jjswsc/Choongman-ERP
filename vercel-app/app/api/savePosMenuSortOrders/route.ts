import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendPosCatalogTenantFilter,
  assertPosCatalogTenantWritable,
  resolvePosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'

type SortUpdate = { id: number; sortOrder: number }

function parseUpdates(raw: unknown): SortUpdate[] {
  if (!Array.isArray(raw)) return []
  const out: SortUpdate[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const id = Math.trunc(Number((row as { id?: unknown }).id))
    const sortOrder = Math.trunc(Number((row as { sortOrder?: unknown }).sortOrder))
    if (!Number.isFinite(id) || id <= 0) continue
    if (!Number.isFinite(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) continue
    out.push({ id, sortOrder })
    if (out.length >= 400) break
  }
  return out
}

/** 카테고리 안 메뉴 타일 순서만 저장한다. 이름·가격·Grab 동기화는 건드리지 않는다. */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const auth = await getVerifiedAuth(req, { skipSaasGate: true })
    const body = (await req.json()) as { updates?: unknown; storeCode?: string }
    const catalogScope = await resolvePosCatalogTenantScope({
      auth,
      storeCode: String(body.storeCode || '').trim() || null,
    })
    const writeBlock = assertPosCatalogTenantWritable(catalogScope)
    if (writeBlock) {
      return NextResponse.json({ success: false, message: writeBlock }, { status: 403, headers })
    }
    const updates = parseUpdates(body.updates)
    if (updates.length === 0) {
      return NextResponse.json({ success: true, updated: 0 }, { headers })
    }
    const idList = updates.map((row) => row.id).join(',')
    const tenantFilter = appendPosCatalogTenantFilter(`id=in.(${idList})`, catalogScope)
    const rows = (await supabaseSelectFilter('pos_menus', tenantFilter, {
      select: 'id',
      limit: 500,
    })) as { id?: number }[] | null
    const allowed = new Set(
      (rows || []).map((row) => Math.trunc(Number(row.id || 0))).filter((id) => id > 0)
    )
    let updated = 0
    for (const row of updates) {
      if (!allowed.has(row.id)) continue
      const filter = appendPosCatalogTenantFilter(`id=eq.${row.id}`, catalogScope)
      await supabaseUpdateByFilter('pos_menus', filter, { sort_order: row.sortOrder })
      updated += 1
    }
    return NextResponse.json({ success: true, updated }, { headers })
  } catch (e) {
    console.error('savePosMenuSortOrders:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
