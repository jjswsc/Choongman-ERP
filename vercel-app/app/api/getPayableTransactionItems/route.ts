/**
 * 미지급금 거래별 품목 조회
 * - ref_type=Inbound, ref_id=batch_id → stock_logs (입고 품목)
 * - ref_type=PO, ref_id=po_id → purchase_orders.cart_json (발주 품목)
 * - 그 외(Payment, Opening 등) → 빈 배열
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'

export interface PayableItemRow {
  code?: string
  name?: string
  spec?: string
  qty: number
  unitCost?: number
  amount: number
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(request.url)
    const refType = String(searchParams.get('refType') || '').trim()
    const refId = Number(searchParams.get('refId') || 0)
    if (!refType || !refId || isNaN(refId)) {
      return NextResponse.json({ items: [] }, { headers })
    }

    let items: PayableItemRow[] = []

    if (refType === 'Inbound') {
      const logRows = (await supabaseSelectFilter('stock_logs', `inbound_batch_id=eq.${refId}`, {
        select: 'item_code,item_name,spec,qty,unit_cost',
        limit: 500,
      })) as { item_code?: string; item_name?: string; spec?: string; qty?: number; unit_cost?: number | null }[] | null

      const itemRows = (await supabaseSelect('items', { limit: 5000, select: 'code,spec,cost' })) as {
        code?: string
        spec?: string
        cost?: number
      }[] | null
      const itemMap: Record<string, { spec: string; cost: number }> = {}
      for (const r of itemRows || []) {
        const code = String(r.code || '').trim()
        if (code) itemMap[code] = { spec: r.spec || '-', cost: Number(r.cost) || 0 }
      }

      for (const r of logRows || []) {
        const code = String(r.item_code || '').trim()
        const info = itemMap[code] || { spec: '-', cost: 0 }
        const qty = Number(r.qty) || 0
        const unitCost = r.unit_cost != null && !isNaN(Number(r.unit_cost)) ? Number(r.unit_cost) : info.cost
        items.push({
          code,
          name: r.item_name || '-',
          spec: r.spec || info.spec,
          qty,
          unitCost,
          amount: qty * unitCost,
        })
      }
    } else if (refType === 'PO') {
      const poRows = (await supabaseSelectFilter('purchase_orders', `id=eq.${refId}`, {
        select: 'cart_json',
        limit: 1,
      })) as { cart_json?: string }[] | null
      const cartJson = poRows?.[0]?.cart_json
      if (cartJson) {
        try {
          const cart = JSON.parse(cartJson) as { code?: string; name?: string; price?: number; qty?: number }[]
          for (const c of cart || []) {
            const qty = Number(c.qty) || 0
            const price = Number(c.price) || 0
            items.push({
              code: c.code || undefined,
              name: c.name || '-',
              qty,
              unitCost: price,
              amount: qty * price,
            })
          }
        } catch {
          // ignore parse error
        }
      }
    }

    return NextResponse.json({ items }, { headers })
  } catch (e) {
    console.error('getPayableTransactionItems:', e)
    return NextResponse.json({ items: [] }, { headers })
  }
}
