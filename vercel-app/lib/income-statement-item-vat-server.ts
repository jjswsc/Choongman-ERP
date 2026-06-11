import 'server-only'

import { supabaseSelect } from '@/lib/supabase-server'
import { normalizeItemTaxType, type ItemTaxType } from '@/lib/income-statement-item-vat'

/** items.tax_type — 없으면 taxable (서버·손익 집계 전용) */
export async function loadItemTaxTypeMap(): Promise<Map<string, ItemTaxType>> {
  const out = new Map<string, ItemTaxType>()
  let rows: { code?: string; tax_type?: string }[] | null = null
  try {
    rows = (await supabaseSelect('items', {
      order: 'id.asc',
      limit: 12000,
      select: 'code,tax_type',
    })) as { code?: string; tax_type?: string }[] | null
  } catch {
    try {
      rows = (await supabaseSelect('items', {
        order: 'id.asc',
        limit: 12000,
        select: 'code',
      })) as { code?: string }[] | null
    } catch {
      return out
    }
  }
  for (const r of rows || []) {
    const code = String(r.code || '').trim()
    if (!code) continue
    out.set(code, normalizeItemTaxType((r as { tax_type?: string }).tax_type))
  }
  return out
}
