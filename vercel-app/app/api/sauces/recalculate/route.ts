import { NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

/** POST: 모든 배합 원가 재계산 및 cost_per_unit 캐시 업데이트 */
export async function POST() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const [sauceRows, ingRows, itemRows] = await Promise.all([
      supabaseSelect('sauces', { order: 'sort_order.asc,id.asc', limit: 500 }),
      supabaseSelect('sauce_ingredients', { limit: 5000, select: 'sauce_id,item_code,quantity,loss_rate' }),
      supabaseSelect('items', { limit: 5000, select: 'code,cost,price,total_quantity,unit' }),
    ]) as [
      { id?: number; code?: string; name?: string; overhead_percent?: number; total_quantity?: number | null }[] | null,
      { sauce_id?: number; item_code?: string; quantity?: number; loss_rate?: number }[] | null,
      { code?: string; cost?: number; price?: number; total_quantity?: number; unit?: string }[] | null,
    ]

    const { getItemCostPerUnit } = await import('@/lib/item-cost-util')
    const itemCost: Record<string, number> = {}
    for (const r of itemRows || []) {
      const code = String(r.code ?? '').trim()
      if (code) itemCost[code] = getItemCostPerUnit(r, false)
    }

    const sauceCostPerUnit: Record<string, number> = {}
    const sauceRowsArr = sauceRows || []
    for (const s of sauceRowsArr) {
      const code = String(s.code ?? '').trim()
      if (code) sauceCostPerUnit[code] = 0
      const name = String(s.name ?? '').trim()
      if (name && sauceCostPerUnit[name] === undefined) sauceCostPerUnit[name] = 0
    }

    for (let pass = 0; pass < 5; pass++) {
      let changed = false
      for (const s of sauceRowsArr) {
        const sid = Number(s.id ?? 0)
        const code = String(s.code ?? '').trim()
        const ings = (ingRows || []).filter((i) => Number(i.sauce_id) === sid)
        let totalCost = 0
        let totalQty = 0
        let allResolved = true
        for (const ing of ings) {
          const icode = String(ing.item_code ?? '').trim()
          const qty = Number(ing.quantity ?? 1)
          const lossRate = Number(ing.loss_rate ?? 0)
          const cost = itemCost[icode] ?? sauceCostPerUnit[icode]
          if (cost === undefined) {
            allResolved = false
            break
          }
          totalCost += cost * qty * (1 + lossRate / 100)
          totalQty += qty
        }
        const qtyForUnit = Number(s.total_quantity ?? 0) || totalQty
        if (allResolved && qtyForUnit > 0) {
          const oh = Number(s.overhead_percent ?? 5)
          const costPerUnit = (totalCost * (1 + oh / 100)) / qtyForUnit
          const prev = sauceCostPerUnit[code]
          if (Math.abs((prev ?? 0) - costPerUnit) > 1e-9) {
            sauceCostPerUnit[code] = costPerUnit
            const name = String(s.name ?? '').trim()
            if (name) sauceCostPerUnit[name] = costPerUnit
            changed = true
          }
        }
      }
      if (!changed) break
    }

    for (const s of sauceRowsArr) {
      const code = String(s.code ?? '').trim()
      const cpu = sauceCostPerUnit[code] ?? 0
      await supabaseUpdate('sauces', s.id!, {
        cost_per_unit: Math.round(cpu * 1000000) / 1000000,
        updated_at: new Date().toISOString(),
      })
    }

    return NextResponse.json({ success: true, count: sauceRowsArr.length }, { headers })
  } catch (e) {
    console.error('recalculateSauces:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
