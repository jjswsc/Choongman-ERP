import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseInsert,
  supabaseUpdate,
  supabaseUpdateByFilter,
  supabaseDeleteByFilter,
  supabaseInsertMany,
} from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

/** GET: 배합(sauces) 목록 + 레시피 + 계산된 원가 */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    /** usage_kind 등은 `sql/sauces_usage_kind.sql` 미적용 DB에서 select 실패 → 구 컬럼만으로 재시도 */
    type SauceDbRow = {
      id?: number
      code?: string
      name?: string
      unit?: string
      total_quantity?: number
      cost_per_unit?: number
      overhead_percent?: number
      sort_order?: number
      usage_kind?: string
      linked_item_code?: string | null
    }
    let sauceRows: SauceDbRow[] | null
    try {
      sauceRows = (await supabaseSelect('sauces', {
        order: 'sort_order.asc,id.asc',
        limit: 500,
        select: 'id,code,name,unit,total_quantity,cost_per_unit,overhead_percent,sort_order,usage_kind,linked_item_code',
      })) as SauceDbRow[] | null
    } catch (e) {
      console.warn('getSauces: sauces select (with usage_kind) failed, retrying base columns:', e)
      try {
        sauceRows = (await supabaseSelect('sauces', {
          order: 'sort_order.asc,id.asc',
          limit: 500,
          select: 'id,code,name,unit,total_quantity,cost_per_unit,overhead_percent,sort_order',
        })) as SauceDbRow[] | null
      } catch (e2) {
        console.warn('getSauces: sauces select (sort_order) failed, retrying id.asc only:', e2)
        sauceRows = (await supabaseSelect('sauces', {
          order: 'id.asc',
          limit: 500,
          select: 'id,code,name,unit,total_quantity,cost_per_unit,overhead_percent',
        })) as SauceDbRow[] | null
      }
    }

    let ingRows: { id?: number; sauce_id?: number; item_code?: string; quantity?: number; loss_rate?: number; sort_order?: number }[] | null
    try {
      ingRows = (await supabaseSelect('sauce_ingredients', {
        limit: 5000,
        select: 'id,sauce_id,item_code,quantity,loss_rate,sort_order',
      })) as { id?: number; sauce_id?: number; item_code?: string; quantity?: number; loss_rate?: number; sort_order?: number }[] | null
    } catch (e) {
      console.warn('getSauces: sauce_ingredients (with sort_order) failed, retrying without sort_order:', e)
      ingRows = (await supabaseSelect('sauce_ingredients', {
        limit: 5000,
        select: 'id,sauce_id,item_code,quantity,loss_rate',
      })) as { id?: number; sauce_id?: number; item_code?: string; quantity?: number; loss_rate?: number; sort_order?: number }[] | null
    }

    /** items 조회 실패 시 배합 행 자체는 내려주고 원가만 0·근사로 계산 (getItems와 동일하게 컬럼 단계적 축소) */
    type ItemRow = { code?: string; name?: string; cost?: number; price?: number; total_quantity?: number | null; unit?: string }
    let itemRows: ItemRow[] | null = null
    try {
      itemRows = (await supabaseSelect('items', {
        limit: 5000,
        select: 'code,name,cost,price,total_quantity,unit',
      })) as ItemRow[] | null
    } catch (e) {
      console.warn('getSauces: items select (with cost) failed:', e)
      try {
        itemRows = (await supabaseSelect('items', {
          limit: 5000,
          select: 'code,name,price,total_quantity,unit',
        })) as ItemRow[] | null
      } catch (e2) {
        console.warn('getSauces: items minimal select failed, continuing without item prices:', e2)
        itemRows = []
      }
    }

    const { getItemCostPerUnit } = await import('@/lib/item-cost-util')
    const itemMap: Record<string, { name: string; cost: number; unit: string }> = {}
    for (const r of itemRows || []) {
      const code = String(r.code ?? '').trim()
      if (code) {
        const costPerUnit = getItemCostPerUnit(r, false) // 배합 재료는 음식(g 기준)
        itemMap[code] = { name: String(r.name ?? ''), cost: costPerUnit, unit: String(r.unit ?? 'g') }
      }
    }

    const sauceCostMap: Record<string, number> = {}
    const sauceRowsArr = sauceRows || []
    for (const s of sauceRowsArr) {
      const code = String(s.code ?? '').trim()
      if (code) sauceCostMap[code] = Number(s.cost_per_unit ?? 0)
      const name = String(s.name ?? '').trim()
      if (name && sauceCostMap[name] === undefined) {
        sauceCostMap[name] = Number(s.cost_per_unit ?? 0)
      }
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
          itemName: itemMap[code]?.name ?? (sauceCostMap[code] !== undefined ? `[배합] ${code}` : code),
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

      const usageRaw = String(s.usage_kind ?? 'for_sale').trim()
      const usageKind = usageRaw === 'store_use' ? 'store_use' : 'for_sale'
      const linkedItemCode = s.linked_item_code != null && String(s.linked_item_code).trim()
        ? String(s.linked_item_code).trim()
        : undefined
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
        usageKind,
        linkedItemCode,
      }
    })

    const rawDbRows = Array.isArray(sauceRows) ? sauceRows.length : -1
    headers.set('X-CM-Sauces-Db-Rows', String(rawDbRows))
    headers.set(
      'X-CM-Supabase-Key-Mode',
      (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() ? 'service' : 'anon'
    )

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getSauces:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ message: msg }, { status: 500, headers })
  }
}

async function computeAndSaveSauceCost(sauceId: number) {
  const { getItemCostPerUnit } = await import('@/lib/item-cost-util')
  const [sauceRows, ingRows, itemRows, allSauceRows] = await Promise.all([
    supabaseSelectFilter('sauces', `id=eq.${sauceId}`, { limit: 1 }),
    supabaseSelectFilter('sauce_ingredients', `sauce_id=eq.${sauceId}`, { limit: 200 }),
    supabaseSelect('items', { limit: 5000, select: 'code,cost,price,total_quantity,unit' }),
    supabaseSelect('sauces', { limit: 500, select: 'id,code,name,cost_per_unit,overhead_percent' }),
  ]) as [
    { id?: number; code?: string; overhead_percent?: number; total_quantity?: number | null }[] | null,
    { item_code?: string; quantity?: number; loss_rate?: number }[] | null,
    { code?: string; cost?: number; price?: number; total_quantity?: number; unit?: string }[] | null,
    { id?: number; code?: string; name?: string; cost_per_unit?: number; overhead_percent?: number }[] | null,
  ]

  const s = (sauceRows || [])[0]
  if (!s) return

  const itemCost: Record<string, number> = {}
  for (const r of itemRows || []) {
    const c = String(r.code ?? '').trim()
    if (c) itemCost[c] = getItemCostPerUnit(r, false)
  }

  const sauceCostMap: Record<string, number> = {}
  for (const row of allSauceRows || []) {
    const c = String(row.code ?? '').trim()
    if (c && row.id !== sauceId) sauceCostMap[c] = Number(row.cost_per_unit ?? 0)
    const n = String(row.name ?? '').trim()
    if (n && row.id !== sauceId && sauceCostMap[n] === undefined) {
      sauceCostMap[n] = Number(row.cost_per_unit ?? 0)
    }
  }

  const ings = ingRows || []
  let totalCost = 0
  let totalQty = 0
  let allResolved = true
  for (const ing of ings) {
    const icode = String(ing.item_code ?? '').trim()
    const qty = Number(ing.quantity ?? 1)
    const lossRate = Number(ing.loss_rate ?? 0)
    const cost = itemCost[icode] ?? sauceCostMap[icode]
    if (cost === undefined) {
      allResolved = false
      break
    }
    totalCost += cost * qty * (1 + lossRate / 100)
    totalQty += qty
  }

  /** GET과 동일: DB에 총용량이 있으면 단가 분모로 사용, 없으면 재료 합계 */
  const qtyForUnit = Number(s.total_quantity ?? 0) || totalQty
  if (allResolved && qtyForUnit > 0) {
    const oh = Number(s.overhead_percent ?? 5)
    const costPerUnit = (totalCost * (1 + oh / 100)) / qtyForUnit
    await supabaseUpdate('sauces', sauceId, {
      cost_per_unit: Math.round(costPerUnit * 1000000) / 1000000,
      updated_at: new Date().toISOString(),
    })
  }
}

async function updateLegacySauceItemCodeRefs(params: {
  oldCode: string
  oldName: string
  newCode: string
}) {
  const oldCode = String(params.oldCode ?? '').trim()
  const oldName = String(params.oldName ?? '').trim()
  const newCode = String(params.newCode ?? '').trim()
  if (!newCode) return

  const oldKeys = new Set<string>()
  if (oldCode) oldKeys.add(oldCode)
  if (oldName) oldKeys.add(oldName)

  for (const oldKey of oldKeys) {
    if (!oldKey || oldKey === newCode) continue
    try {
      await supabaseUpdateByFilter('sauce_ingredients', `item_code=eq.${encodeURIComponent(oldKey)}`, {
        item_code: newCode,
      })
    } catch (e) {
      console.warn('updateLegacySauceItemCodeRefs: sauce_ingredients update failed:', oldKey, e)
    }
    try {
      await supabaseUpdateByFilter('pos_menu_ingredients', `item_code=eq.${encodeURIComponent(oldKey)}`, {
        item_code: newCode,
      })
    } catch (e) {
      console.warn('updateLegacySauceItemCodeRefs: pos_menu_ingredients update failed:', oldKey, e)
    }
  }
}

/** POST: 배합(sauce) 저장 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'office')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }

    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const code = String(body.code ?? '').trim()
    const name = String(body.name ?? '').trim()
    const unit = String(body.unit ?? 'g').trim() || 'g'
    const rawOh = Number(body.overheadPercent)
    const overheadPercent = (body.overheadPercent != null && !isNaN(rawOh) && rawOh >= 0 && rawOh <= 50) ? rawOh : 5
    const totalQuantity = body.totalQuantity != null ? Number(body.totalQuantity) : null
    const ingredients: { itemCode: string; quantity: number; lossRate?: number }[] = Array.isArray(body.ingredients) ? body.ingredients : []
    const usageKind = String(body.usageKind ?? 'for_sale').trim() === 'store_use' ? 'store_use' : 'for_sale'
    const linkedItemCode = String(body.linkedItemCode ?? '').trim()

    if (!code || !name) {
      return NextResponse.json({ success: false, message: 'code and name required' }, { status: 400, headers })
    }

    if (usageKind === 'for_sale') {
      if (!linkedItemCode) {
        return NextResponse.json({ success: false, message: 'for_sale requires linkedItemCode' }, { status: 400, headers })
      }
      const itemCheck = (await supabaseSelectFilter('items', `code=eq.${encodeURIComponent(linkedItemCode)}`, { limit: 1, select: 'code' })) as { code?: string }[] | null
      if (!itemCheck?.length) {
        return NextResponse.json({ success: false, message: 'linkedItemCode not found in items' }, { status: 400, headers })
      }
    }

    const updatePayload: Record<string, unknown> = {
      code,
      name,
      unit,
      overhead_percent: overheadPercent,
      usage_kind: usageKind,
      linked_item_code: usageKind === 'for_sale' ? linkedItemCode : null,
      updated_at: new Date().toISOString(),
    }
    if (totalQuantity != null && totalQuantity >= 0) updatePayload.total_quantity = totalQuantity

    if (id) {
      const prevRows = (await supabaseSelectFilter('sauces', `id=eq.${id}`, {
        limit: 1,
        select: 'code,name',
      })) as { code?: string; name?: string }[] | null
      const prev = (prevRows || [])[0]
      await supabaseUpdate('sauces', id, updatePayload)
      if (prev) {
        await updateLegacySauceItemCodeRefs({
          oldCode: String(prev.code ?? '').trim(),
          oldName: String(prev.name ?? '').trim(),
          newCode: code,
        })
      }
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
      await computeAndSaveSauceCost(id)
      return NextResponse.json({ success: true }, { headers })
    }

    const insertPayload: Record<string, unknown> = {
      code,
      name,
      unit,
      overhead_percent: overheadPercent,
      usage_kind: usageKind,
      linked_item_code: usageKind === 'for_sale' ? linkedItemCode : null,
    }
    if (totalQuantity != null && totalQuantity >= 0) insertPayload.total_quantity = totalQuantity
    const inserted = (await supabaseInsert('sauces', insertPayload)) as { id?: number }[]
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
    await computeAndSaveSauceCost(newId)
    return NextResponse.json({ success: true, id: newId }, { headers })
  } catch (e) {
    console.error('saveSauce:', e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
