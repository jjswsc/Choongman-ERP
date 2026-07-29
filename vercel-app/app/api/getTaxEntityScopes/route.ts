import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { assertCanManageAccountingCompliance } from '@/lib/accounting-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { formatTaxEntityScopeLabel } from '@/lib/tax-entity-scope'

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
        const taxId = String(e.tax_id || '').trim()
        const storeCount = countByEntity[code] || 0
        const stores = Array.from(new Set(storesByEntity[code] || [])).sort((a, b) => a.localeCompare(b))
        return {
          value: `entity:${code}`,
          label: formatTaxEntityScopeLabel({
            entityName: name,
            entityCode: code,
            taxId,
            storeCount,
          }),
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
