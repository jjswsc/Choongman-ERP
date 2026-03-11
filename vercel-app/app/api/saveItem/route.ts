import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { recordPriceChanges } from '@/lib/price-history'

function taxTypeToDb(taxType: string): string {
  if (taxType === 'exempt') return '면세'
  if (taxType === 'zero') return '영세율'
  return '과세'
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  let code = ''

  try {
    const body = (await request.json()) as {
      code?: string
      name?: string
      category?: string
      vendor?: string
      outboundLocation?: string
      spec?: string
      unit?: string
      price?: number
      cost?: number
      totalQuantity?: number | null
      taxType?: string
      imageUrl?: string
      description?: string
      editingCode?: string
      purchaseSource?: 'hq' | 'store'
      stockBaseUnit?: string
      stockUnitOptions?: { unit: string; factor: number }[]
      standardUnits?: { unit: string; totalQuantity: number }[]
    }

    code = String(body.code || '').trim()
    const name = String(body.name || '').trim()
    const editingCode = body.editingCode ? String(body.editingCode).trim() : null
    if (!code || !name) {
      return NextResponse.json({ success: false, message: '코드와 품목명이 필요합니다.' }, { headers })
    }

    const tax = taxTypeToDb(body.taxType || 'taxable')
    const purchaseSource = (body.purchaseSource || 'hq') === 'store' ? 'store' : 'hq'
    const categoryRaw = String(body.category || '').trim()
    const category = purchaseSource === 'store' && !categoryRaw ? 'Store Only' : categoryRaw
    const stockUnitOpts = Array.isArray(body.stockUnitOptions)
      ? body.stockUnitOptions
          .filter((x) => x && String(x.unit || '').trim())
          .map((x) => ({ unit: String(x.unit).trim(), factor: Number(x.factor) || 1 }))
      : []
    const standardUnitsDb = Array.isArray(body.standardUnits)
      ? body.standardUnits
          .filter((x) => x && String(x.unit || '').trim() && Number(x.totalQuantity) > 0)
          .map((x) => ({ unit: String(x.unit).trim(), total_quantity: Number(x.totalQuantity) || 1 }))
      : []
    const row = {
      code,
      name,
      category,
      vendor: String(body.vendor || '').trim(),
      outbound_location: String(body.outboundLocation || '').trim(),
      spec: String(body.spec || '').trim(),
      unit: String(body.unit || '').trim(),
      price: Number(body.price) || 0,
      cost: Number(body.cost) || 0,
      total_quantity: body.totalQuantity != null && body.totalQuantity > 0 ? Number(body.totalQuantity) : null,
      image: String(body.imageUrl || '').trim(),
      description: String(body.description || '').trim() || null,
      tax,
      purchase_source: purchaseSource,
      stock_base_unit: String(body.stockBaseUnit || '').trim(),
      stock_unit_options: stockUnitOpts,
      standard_units: standardUnitsDb,
    }

    const filterCode = editingCode || code
    const existing = (await supabaseSelectFilter(
      'items',
      `code=eq.${encodeURIComponent(filterCode)}`
    )) as { id?: number; price?: number; cost?: number; name?: string }[] | null

    if (existing && existing.length > 0) {
      const prev = existing[0] as { price?: number; cost?: number; name?: string; category?: string }
      const cat = (prev.category || row.category || '').trim()
      const changes: { fieldName: string; oldValue: number | null; newValue: number | null }[] = []
      if (Number(prev.price) !== row.price) {
        changes.push({ fieldName: 'price', oldValue: prev.price ?? null, newValue: row.price as number })
      }
      if (Number(prev.cost) !== row.cost) {
        changes.push({ fieldName: 'cost', oldValue: prev.cost ?? null, newValue: row.cost as number })
      }
      if (changes.length > 0) {
        recordPriceChanges({
          entityType: 'item',
          entityId: filterCode,
          entityDisplayName: prev.name ?? name,
          changes,
          category: cat || undefined,
        }).catch(() => {})
      }
    }

    const tryWrite = async (payload: Record<string, unknown>) => {
      if (existing && existing.length > 0) {
        await supabaseUpdateByFilter('items', `code=eq.${encodeURIComponent(filterCode)}`, payload)
      } else {
        await supabaseInsert('items', payload)
        const price = Number(row.price) || 0
        const cost = Number(row.cost) || 0
        recordPriceChanges({
          entityType: 'item',
          entityId: filterCode,
          entityDisplayName: name,
          changes: [
            { fieldName: 'price', oldValue: null, newValue: price },
            { fieldName: 'cost', oldValue: null, newValue: cost },
          ],
          category: (row.category as string || '').trim() || undefined,
        }).catch(() => {})
      }
    }
    try {
      await tryWrite(row)
    } catch (colErr) {
      const errMsg = colErr instanceof Error ? colErr.message : String(colErr)
      if (/stock_base_unit|stock_unit_options|column.*does not exist/i.test(errMsg)) {
        const { stock_base_unit: _sbu, stock_unit_options: _suo, ...rowWithoutStock } = row
        await tryWrite(rowWithoutStock)
      } else {
        throw colErr
      }
    }
    return NextResponse.json({ success: true, message: existing?.length ? '수정되었습니다.' : '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveItem:', e)
    const errMsg = e instanceof Error ? e.message : String(e)
    const isDuplicateCode =
      errMsg.includes('23505') ||
      /duplicate key|unique constraint|items_code/i.test(errMsg)
    const message = isDuplicateCode
      ? `품목 코드 "${code || '(입력값)'}"가 이미 사용 중입니다. 다른 코드를 입력해 주세요.`
      : errMsg || '저장 실패'
    return NextResponse.json({ success: false, message }, { headers })
  }
}
