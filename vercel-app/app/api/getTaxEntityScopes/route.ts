import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { formatTaxEntityScopeLabel } from '@/lib/tax-entity-scope'
import { normalizeStoreTaxId } from '@/lib/store-tax-filing-profile'

type TaxEntityRow = {
  entity_code?: string | null
  entity_name?: string | null
  tax_id?: string | null
  is_active?: boolean | null
}

type TaxEntityStoreRow = {
  entity_code?: string | null
  store_code?: string | null
}

type StoreTaxProfileRow = {
  store_code?: string | null
  tax_id?: string | null
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }
  const userRole = String(authResult.auth.role || '').trim()
  try {
    assertCanManageAccountingCompliance(userRole)
  } catch (e) {
    if (e instanceof Error && e.message.includes('ACCOUNTING_')) {
      return NextResponse.json({ success: false, error: 'FORBIDDEN' }, { status: 403, headers })
    }
    throw e
  }

  try {
    const entities = (await supabaseSelectFilter('tax_entities', '', {
      select: 'entity_code,entity_name,tax_id,is_active',
      order: 'entity_code.asc',
      limit: 5000,
    })) as TaxEntityRow[] | null
    const links = (await supabaseSelectFilter('tax_entity_stores', '', {
      select: 'entity_code,store_code',
      limit: 10000,
    })) as TaxEntityStoreRow[] | null
    const profiles = (await supabaseSelectFilter('store_tax_filing_profiles', '', {
      select: 'store_code,tax_id',
      limit: 5000,
    })) as StoreTaxProfileRow[] | null

    const storesByTaxId = new Map<string, Set<string>>()
    for (const p of profiles || []) {
      const tin = normalizeStoreTaxId(p.tax_id)
      const store = String(p.store_code || '').trim()
      if (tin.length !== 13 || !store) continue
      const set = storesByTaxId.get(tin) || new Set<string>()
      set.add(store)
      storesByTaxId.set(tin, set)
    }

    const active = (entities || []).filter((e) => e.is_active !== false)
    const storesByEntity: Record<string, string[]> = {}
    const countByEntity: Record<string, number> = {}
    for (const row of links || []) {
      const code = String(row.entity_code || '').trim()
      const store = String(row.store_code || '').trim()
      if (!code) continue
      countByEntity[code] = (countByEntity[code] || 0) + 1
      if (!store) continue
      const list = storesByEntity[code] || []
      list.push(store)
      storesByEntity[code] = list
    }

    const scopes = active
      .map((e) => {
        const code = String(e.entity_code || '').trim()
        if (!code) return null
        const name = String(e.entity_name || '').trim()
        const taxId = normalizeStoreTaxId(e.tax_id)
        const linked = new Set(storesByEntity[code] || [])
        // 법인 TIN과 같은 세무 프로필 매장도 포함 (본사만 링크돼도 지점 합산)
        if (taxId.length === 13) {
          for (const s of storesByTaxId.get(taxId) || []) linked.add(s)
        }
        const stores = Array.from(linked).sort((a, b) => a.localeCompare(b))
        const storeCount = Math.max(countByEntity[code] || 0, stores.length)
        return {
          value: `entity:${code}`,
          label: formatTaxEntityScopeLabel({
            entityName: name,
            entityCode: code,
            taxId,
            storeCount,
          }),
          entityName: name,
          entityCode: code,
          taxId,
          storeCount,
          stores,
        }
      })
      .filter(Boolean)

    return NextResponse.json({ success: true, scopes }, { headers })
  } catch (err) {
    console.error('[getTaxEntityScopes]', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'UNKNOWN' },
      { status: 500, headers }
    )
  }
}
