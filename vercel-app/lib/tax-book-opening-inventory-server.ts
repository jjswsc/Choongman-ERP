import { supabaseRpc, supabaseSelectAllPages, supabaseSelectFilterAllPages } from '@/lib/supabase-server'

function resolveUnitCost(cost: unknown, price: unknown): number {
  const c = Number(cost)
  if (Number.isFinite(c) && c > 0) return c
  const p = Number(price)
  if (Number.isFinite(p) && p > 0) return p
  return 0
}

/** 본사(S&J/CM Office) 창고 재고 금액 — 재고현황과 동일(cost ?? price). */
export async function loadHqWarehouseInventoryValue(input: {
  asOfDate: string
  tenantId?: string | null
}): Promise<{ amount: number; asOfDate: string; locationCount: number }> {
  const asOf = String(input.asOfDate || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) throw new Error('INVALID_YEAR_MONTH')
  const asOfIso = `${asOf}T23:59:59.999+07:00`
  const patterns = ['%CM Office%', '%S&J%', '%S and J%', '%SNJ%', '%HQ%']

  let qtyByItem: Record<string, number> = {}
  try {
    const rows = (await supabaseRpc<{ item_code: string; total_qty: number }[]>('get_store_stock', {
      p_location_patterns: patterns,
      p_as_of_date: asOfIso,
      ...(input.tenantId ? { p_tenant_id: input.tenantId } : {}),
    })) as { item_code?: string; total_qty?: number }[] | null
    for (const r of rows || []) {
      const code = String(r.item_code || '').trim()
      if (!code) continue
      qtyByItem[code] = Number(r.total_qty ?? 0)
    }
  } catch {
    const locFilter = `or=(${patterns.map((p) => `location.ilike.${encodeURIComponent(p)}`).join(',')})`
    const logs = (await supabaseSelectFilterAllPages(
      'stock_logs',
      `${locFilter}&log_date=lte.${encodeURIComponent(asOfIso)}`,
      { select: 'item_code,qty', pageSize: 8000, maxRows: 200000 }
    )) as { item_code?: string; qty?: number }[] | null
    qtyByItem = {}
    for (const r of logs || []) {
      const code = String(r.item_code || '').trim()
      if (!code) continue
      qtyByItem[code] = (qtyByItem[code] || 0) + (Number(r.qty) || 0)
    }
  }

  const items = (await supabaseSelectAllPages('items', {
    select: 'code,cost,price',
    pageSize: 8000,
    maxRows: 100000,
    order: 'id.asc',
  })) as { code?: string; cost?: number | null; price?: number | null }[] | null
  const costMap: Record<string, number> = {}
  for (const it of items || []) {
    const code = String(it.code || '').trim()
    if (!code) continue
    costMap[code] = resolveUnitCost(it.cost, it.price)
  }

  let amount = 0
  let locationCount = 0
  for (const [code, qty] of Object.entries(qtyByItem)) {
    if (!Number.isFinite(qty) || Math.abs(qty) < 1e-9) continue
    locationCount += 1
    amount += qty * (costMap[code] || 0)
  }
  return { amount: Math.round(amount * 100) / 100, asOfDate: asOf, locationCount }
}
