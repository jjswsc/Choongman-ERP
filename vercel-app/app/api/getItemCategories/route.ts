import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { isMissingItemCategoriesTableError } from '@/lib/item-categories-db'
import {
  appendInventoryTenantFilter,
  isInventoryTenantQueryBlocked,
  resolveInventoryTenantScope,
} from '@/lib/inventory-tenant-scope'
import { getVerifiedAuth } from '@/lib/verify-auth'

function normalizeCategoryName(raw: string): string {
  const c = String(raw || '').trim()
  if (c === '매장 전용') return 'Store Only'
  if (c === 'Packaging') return 'Packing'
  return c
}

function uniqueSortedCategories(names: string[]): string[] {
  const set = new Set<string>(['Store Only'])
  for (const name of names) {
    const c = normalizeCategoryName(name)
    if (c) set.add(c)
  }
  return Array.from(set).sort()
}

/** 품목 관리 - item_categories 우선, 없으면 items distinct (Packaging→Packing 매핑) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const tenantScope = await resolveInventoryTenantScope({ auth })
    if (isInventoryTenantQueryBlocked(tenantScope)) {
      return NextResponse.json({ categories: ['Store Only'] }, { headers })
    }

    const filter = appendInventoryTenantFilter('', tenantScope)

    let catRows: { name?: string }[] | null = null
    try {
      catRows = (
        filter
          ? await supabaseSelectFilter('item_categories', filter, {
              order: 'sort_order.asc',
              limit: 500,
              select: 'name',
            })
          : await supabaseSelect('item_categories', {
              order: 'sort_order.asc',
              limit: 500,
              select: 'name',
            })
      ) as { name?: string }[] | null
    } catch (e) {
      if (!isMissingItemCategoriesTableError(e)) throw e
      catRows = null
    }

    if (catRows && catRows.length > 0) {
      const categories = (catRows || [])
        .map((r) => String(r.name || '').trim())
        .filter(Boolean)
      return NextResponse.json({ categories }, { headers })
    }

    const rows = (
      filter
        ? await supabaseSelectFilter('items', filter, {
            select: 'category',
            limit: 10000,
          })
        : await supabaseSelect('items', {
            select: 'category',
            limit: 10000,
          })
    ) as { category?: string }[] | null

    const categories = uniqueSortedCategories((rows || []).map((r) => String(r.category || '')))
    return NextResponse.json({ categories }, { headers })
  } catch (e) {
    console.error('getItemCategories:', e)
    return NextResponse.json({ categories: [] }, { headers })
  }
}
