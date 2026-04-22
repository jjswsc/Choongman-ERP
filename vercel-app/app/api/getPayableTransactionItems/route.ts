/**
 * 미수·미지급 거래별 품목 조회
 * - ref_type=Order, ref_id=order_id → orders.cart_json (주문 품목)
 * - ref_type=ForceOutbound, ref_id=stock_logs.id (log_type=ForceOutbound) → 단일 출고 줄
 * - ref_type=Inbound, ref_id=batch_id → stock_logs (입고 품목)
 * - ref_type=PO, ref_id=po_id → purchase_orders.cart_json (발주 품목)
 * - 그 외(Payment, Opening 등) → 빈 배열
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelect } from '@/lib/supabase-server'
import { getDirectSettlementMap } from '@/lib/direct-settlement-server'
import { parsePurchaseOrderCart } from '@/lib/purchase-order-cart'
import { thaiInvoiceTotalsFromRawSubtotal } from '@/lib/invoice-vat-total'
import { getLineRemarksFromCartLine, type OrderCartLine, unitPriceFromOutboundLogSnapshot } from '@/lib/outbound-order-line-match'

export interface PayableItemRow {
  code?: string
  name?: string
  spec?: string
  /** 인보이스 품목 하단 비고 (cart_json line_remarks) */
  line_remarks?: string
  qty: number
  unitCost?: number
  amount: number
}

/** 주문 품목 공급가 합계 기준 — 미수금·출고 인보이스와 동일 (소계 round → VAT 7% round → 합계) */
export type OrderInvoiceTotals = ReturnType<typeof thaiInvoiceTotalsFromRawSubtotal>

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const { searchParams } = new URL(request.url)
    const refType = String(searchParams.get('refType') || '').trim()
    const refId = Number(searchParams.get('refId') || 0)
    if (!refType || !refId || isNaN(refId)) {
      return NextResponse.json({ items: [], orderInvoiceTotals: undefined }, { headers })
    }

    const items: PayableItemRow[] = []
    let orderInvoiceTotals: OrderInvoiceTotals | undefined

    if (refType === 'Order') {
      const orderRows = (await supabaseSelectFilter('orders', `id=eq.${refId}`, {
        select: 'cart_json',
        limit: 1,
      })) as { cart_json?: string | null }[] | null
      const cartJson = orderRows?.[0]?.cart_json
      if (cartJson) {
        try {
          const cart = JSON.parse(cartJson) as unknown
          if (Array.isArray(cart)) {
            for (const raw of cart) {
              const c = raw as OrderCartLine
              const qty = Number(c.qty) || 0
              const price = Number(c.price) || 0
              const lr = getLineRemarksFromCartLine(c)
              items.push({
                code: c.code ? String(c.code).trim() : undefined,
                name: c.name ? String(c.name) : '-',
                spec: c.spec != null ? String(c.spec) : undefined,
                ...(lr ? { line_remarks: lr } : {}),
                qty,
                unitCost: price,
                amount: qty * price,
              })
            }
          }
        } catch {
          // ignore parse error
        }
      }
      const rawSum = items.reduce((s, it) => s + Number(it.amount || 0), 0)
      if (items.length > 0) {
        orderInvoiceTotals = thaiInvoiceTotalsFromRawSubtotal(rawSum)
      }
    } else if (refType === 'Inbound') {
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
          const { items: cartLines } = parsePurchaseOrderCart(cartJson)
          for (const c of cartLines || []) {
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
    } else if (refType === 'ForceOutbound') {
      const logRows = (await supabaseSelectFilter(
        'stock_logs',
        `id=eq.${refId}&log_type=eq.ForceOutbound`,
        {
          select: 'id,item_code,item_name,qty,invoice_unit_price',
          limit: 1,
        }
      )) as
        | {
            id?: number
            item_code?: string
            item_name?: string
            qty?: number
            invoice_unit_price?: number | string | null
          }[]
        | null
      const log = logRows?.[0]
      if (log) {
        const itemRows = (await supabaseSelect('items', { limit: 5000, select: 'code,spec,price' })) as {
          code?: string
          spec?: string
          price?: number
        }[] | null
        const itemMap: Record<string, { spec: string; price: number }> = {}
        for (const r of itemRows || []) {
          const c = String(r.code || '').trim()
          if (c) itemMap[c] = { spec: String(r.spec || '').trim() || '-', price: Number(r.price) || 0 }
        }
        const code = String(log.item_code || '').trim()
        const name = String(log.item_name || '').trim() || '-'
        const info = itemMap[code] || { spec: '-', price: 0 }
        const master = info.price
        const unitPrice = unitPriceFromOutboundLogSnapshot(log, undefined, code, name, master)
        const qtyAbs = Math.abs(Number(log.qty) || 0)
        const directMap = code ? await getDirectSettlementMap([code]) : {}
        let rawLine = qtyAbs * unitPrice
        if (code && directMap[code]) rawLine = 0
        orderInvoiceTotals = thaiInvoiceTotalsFromRawSubtotal(rawLine)
        items.push({
          code: code || undefined,
          name,
          spec: info.spec && info.spec !== '-' ? info.spec : undefined,
          qty: qtyAbs,
          unitCost: unitPrice,
          amount: rawLine,
        })
      }
    }

    return NextResponse.json({ items, orderInvoiceTotals }, { headers })
  } catch (e) {
    console.error('getPayableTransactionItems:', e)
    return NextResponse.json({ items: [], orderInvoiceTotals: undefined }, { headers })
  }
}
