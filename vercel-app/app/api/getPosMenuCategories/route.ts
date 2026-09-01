import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { normalizePromotionCategoryMain } from '@/lib/pos-promo-constants'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendPosCatalogTenantFilter,
  isMissingTenantIdColumnError,
  isPosCatalogTenantQueryBlocked,
  resolvePosCatalogTenantScope,
} from '@/lib/pos-catalog-tenant-scope'

const EMPTY = { categories: [] as string[], mainCategories: [] as string[] }

function distinctCategoriesFromRows(
  rows: { category?: string; category_main?: string }[] | null
): { categories: string[]; mainCategories: string[] } {
  const catSet = new Set<string>()
  const mainSet = new Set<string>()
  for (const r of rows || []) {
    const cRaw = String(r.category || '').trim()
    if (cRaw) catSet.add(normalizePromotionCategoryMain(cRaw))
    const m = normalizePromotionCategoryMain(r.category_main)
    if (m) mainSet.add(m)
  }
  const categories = Array.from(catSet).sort()
  let mainCategories = Array.from(mainSet).sort()
  if (mainCategories.length === 0 && categories.length > 0) {
    mainCategories = categories
  }
  return { categories, mainCategories }
}

/** POS 메뉴 카테고리 목록 (테넌트별 distinct). Omni는 타사 메뉴 분류를 노출하지 않는다. */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'private, no-store')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const catalogScope = await resolvePosCatalogTenantScope({ auth })
    if (isPosCatalogTenantQueryBlocked(catalogScope)) {
      return NextResponse.json(EMPTY, { headers })
    }

    const tenantFilter = appendPosCatalogTenantFilter('', catalogScope)
    let rows: { category?: string; category_main?: string }[] | null = null
    try {
      rows = (
        tenantFilter
          ? await supabaseSelectFilter('pos_menus', tenantFilter, {
              select: 'category,category_main',
              limit: 20000,
            })
          : await supabaseSelect('pos_menus', {
              select: 'category,category_main',
              limit: 20000,
            })
      ) as { category?: string; category_main?: string }[] | null
    } catch (colErr) {
      if (tenantFilter && isMissingTenantIdColumnError(colErr)) {
        console.error('getPosMenuCategories: pos_menus.tenant_id missing — run sql/pos_catalog_tenant_id.sql')
        return NextResponse.json(EMPTY, { headers })
      }
      try {
        rows = (
          tenantFilter
            ? await supabaseSelectFilter('pos_menus', tenantFilter, {
                select: 'category',
                limit: 20000,
              })
            : await supabaseSelect('pos_menus', {
                select: 'category',
                limit: 20000,
              })
        ) as { category?: string }[] | null
      } catch (fallbackErr) {
        if (tenantFilter && isMissingTenantIdColumnError(fallbackErr)) {
          return NextResponse.json(EMPTY, { headers })
        }
        throw fallbackErr
      }
    }

    return NextResponse.json(distinctCategoriesFromRows(rows), { headers })
  } catch (e) {
    console.error('getPosMenuCategories:', e)
    return NextResponse.json(EMPTY, { headers })
  }
}
