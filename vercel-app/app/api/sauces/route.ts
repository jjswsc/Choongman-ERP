import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdate,
  supabaseDeleteByFilter,
  supabaseInsertMany,
} from '@/lib/supabase-server'

/** GET: 소스 목록 + 레시피 + 계산된 원가 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const [sauceRows, ingRows, itemRows] = await Promise.all([
      supabaseSelect('sauces', { order: 'sort_order.asc,id.asc', limit: 500, select: 'id,code,name,unit,total_quantity,cost_per_unit,overhead_percent,sort_order' }),
      supabaseSelect('sauce_ingredients', { limit: 5000, select: 'id,sauce_id,item_code,quantity,loss_rate,sort_order' }),
      supabaseSelect('items', { limit: 5000, select: 'code,name,cost,price,total_quantity,unit' }),
    ]) as [
      { id?: number; code?: string; name?: string; unit?: string; total_quantity?: number; cost_per_unit?: number; overhead_percent?: number; sort_order?: number }[] | null,
      { id?: number; sauce_id?: number; item_code?: string; quantity?: number; loss_rate?: number; sort_order?: number }[] | null,
      { code?: string; name?: string; cost?: number; price?: number; total_quantity?: number; unit?: string }[] | null,
    ]

    const { getItemCostPerUnit } = await import('@/lib/item-cost-util')
    const itemMap: Record<string, { name: string; cost: number; unit: string }> = {}
    for (const r of itemRows || []) {
      const code = String(r.code ?? '').trim()
      if (code) {
        const costPerUnit = getItemCostPerUnit(r, false) // 소스 재료는 음식(g 기준)
        itemMap[code] = { name: String(r.name ?? ''), cost: costPerUnit, unit: String(r.unit ?? 'g') }
      }
    }

    const sauceCostMap: Record<string, number> = {}
    const sauceRowsArr = sauceRows || []
    for (const s of sauceRowsArr) {
      const code = String(s.code ?? '').trim()
      if (code) sauceCostMap[code] = Number(s.cost_per_unit ?? 0)
    }

    const ingBySauce: Record<number, { id?: number; item_code?: string; quantity?: number; loss_rate?: number }[]> = {}
    for (const ing of ingRows || []) {
      const sid = Number(ing.sauce_id ?? 0)
      if (!ingBySauce[sid]) ingBySauce[sid] = []
      ingBySauce[sid].push(ing)
    }

    const defaultOh = 5
    const list = sauceRowsArr.map((s) => {
      const ings = ingBySauce[Number(s.id ?? 0)] || []
      let totalCost = 0
      const ingredients = ings.map((ing) => {
        const code = String(ing.item_code ?? '').trim()
        const qty = Number(ing.quantity ?? 1)
        const lossRate = Number(ing.loss_rate ?? 0)
        const costPerUnit = itemMap[code]?.cost ?? sauceCostMap[code] ?? 0
        const costTotal = costPerUnit * qty * (1 + lossRate / 100)
        totalCost += costTotal
        return {
          id: ing.id,
          itemCode: code,
          itemName: itemMap[code]?.name ?? (sauceCostMap[code] !== undefined ? `[소스] ${code}` : code),
          quantity: qty,
          lossRate,
          costPerUnit,
          costTotal: Math.round(costTotal * 100) / 100,
          unit: itemMap[code]?.unit ?? 'g',
        }
      })

      const oh = Number(s.overhead_percent ?? defaultOh)
      const totalWithOh = totalCost * (1 + oh / 100)
      const totalQty = Number(s.total_quantity ?? 0) || ingredients.reduce((sum, i) => sum + i.quantity, 0)
      const costPerUnit = totalQty > 0 ? totalWithOh / totalQty : 0

      return {
        id: s.id,
        code: String(s.code ?? ''),
        name: String(s.name ?? ''),
        unit: String(s.unit ?? 'g'),
        totalQuantity: totalQty,
        totalCost: Math.round(totalCost * 100) / 100,
        overheadPercent: oh,
        totalWithOverhead: Math.round(totalWithOh * 100) / 100,
        costPerUnit: Math.round(costPerUnit * 1000000) / 1000000,
        ingredients,
        purchaseSource: 'hq' as const,
      }
    })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getSauces:', e)
    return NextResponse.json([], { headers })
  }
}

/** POST: 소스 저장 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const code = String(body.code ?? '').trim()
    const name = String(body.name ?? '').trim()
    const unit = String(body.unit ?? 'g').trim() || 'g'
    const overheadPercent = Number(body.overheadPercent) || 5
    const ingredients: { itemCode: string; quantity: number; lossRate?: number }[] = Array.isArray(body.ingredients) ? body.ingredients : []

    if (!code || !name) {
      return NextResponse.json({ success: false, message: 'code and name required' }, { status: 400, headers })
    }

    if (id) {
      await supabaseUpdate('sauces', id, { code, name, unit, overhead_percent: overheadPercent, updated_at: new Date().toISOString() })
      await supabaseDeleteByFilter('sauce_ingredients', `sauce_id=eq.${id}`)
      if (ingredients.length > 0) {
        const rows = ingredients.map((ing, idx) => ({
          sauce_id: id,
          item_code: String(ing.itemCode ?? '').trim(),
          quantity: Number(ing.quantity) ?? 1,
          loss_rate: Number(ing.lossRate) ?? 0,
          sort_order: idx,
        }))
        await supabaseInsertMany('sauce_ingredients', rows)
      }
      return NextResponse.json({ success: true }, { headers })
    }

    const inserted = (await supabaseInsert('sauces', { code, name, unit, overhead_percent: overheadPercent })) as { id?: number }[]
    const newRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = newRow?.id
    if (!newId) return NextResponse.json({ success: false, message: 'insert failed' }, { status: 500, headers })

    if (ingredients.length > 0) {
      const rows = ingredients.map((ing, idx) => ({
        sauce_id: newId,
        item_code: String(ing.itemCode ?? '').trim(),
        quantity: Number(ing.quantity) ?? 1,
        loss_rate: Number(ing.lossRate) ?? 0,
        sort_order: idx,
      }))
      await supabaseInsertMany('sauce_ingredients', rows)
    }
    return NextResponse.json({ success: true, id: newId }, { headers })
  } catch (e) {
    console.error('saveSauce:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
