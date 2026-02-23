import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseInsertMany } from '@/lib/supabase-server'

/** 입고 등록 저장 - inbound_batches + stock_logs + payable(입고 건별) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const storeName = (typeof body === 'object' && body?.storeName) ? String(body.storeName).trim() : null
    const vendorCode = (typeof body === 'object' && body?.vendorCode) ? String(body.vendorCode).trim() || null : null
    const purchaseOrderId = (typeof body === 'object' && body?.purchaseOrderId) ? Number(body.purchaseOrderId) : null
    const invoiceNo = (typeof body === 'object' && body?.invoiceNo) ? String(body.invoiceNo).trim() || null : null
    const list = Array.isArray(body) ? body : (body?.list || []) as {
      date?: string
      vendor?: string
      code?: string
      name?: string
      spec?: string
      qty?: number | string
      cost?: number | string
    }[]

    if (!list.length) {
      return NextResponse.json(
        { success: false, message: '저장할 목록이 없습니다.' },
        { headers }
      )
    }

    const location = storeName || '입고등록'
    const vendorName = String(list[0]?.vendor || '').trim()
    const batchDate = list[0]?.date ? new Date(list[0].date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)

    let totalAmount = 0
    const rows = list.map((item) => {
      const qty = parseFloat(String(item.qty || 0).replace(/,/g, '')) || 0
      const costVal = item.cost != null && item.cost !== '' ? parseFloat(String(item.cost).replace(/,/g, '')) : null
      const cost = costVal != null && !isNaN(costVal) && costVal >= 0 ? costVal : 0
      totalAmount += qty * cost
      const dateObj = item.date ? new Date(item.date) : new Date()
      const row: Record<string, unknown> = {
        location,
        item_code: String(item.code || '').trim(),
        item_name: String(item.name || '').trim(),
        spec: String(item.spec || '').trim() || '-',
        qty,
        log_date: dateObj.toISOString(),
        vendor_target: String(item.vendor || '').trim(),
        log_type: 'Inbound',
      }
      if (costVal != null && !isNaN(costVal) && costVal >= 0) {
        row.unit_cost = costVal
      }
      return row
    })

    const validRows = rows.filter((r) => r.item_code)
    if (!validRows.length) {
      return NextResponse.json(
        { success: false, message: '유효한 품목이 없습니다.' },
        { headers }
      )
    }

    // 1. inbound_batches 생성
    const batchRow: Record<string, unknown> = {
      location,
      vendor_name: vendorName || '-',
      vendor_code: vendorCode,
      batch_date: batchDate,
      total_amount: totalAmount,
      purchase_order_id: purchaseOrderId && !isNaN(purchaseOrderId) ? purchaseOrderId : null,
    }
    if (invoiceNo) batchRow.invoice_no = invoiceNo
    const batchInserted = (await supabaseInsert('inbound_batches', batchRow)) as { id?: number }[]
    const batchId = Array.isArray(batchInserted) && batchInserted[0]?.id ? batchInserted[0].id : null

    // 2. stock_logs에 inbound_batch_id 포함
    const rowsWithBatch = validRows.map((r) => ({ ...r, inbound_batch_id: batchId }))
    await supabaseInsertMany('stock_logs', rowsWithBatch)

    // 3. 미지급금 생성 (입고 건별, From HQ 제외)
    if (batchId && totalAmount > 0 && vendorName && vendorName !== 'From HQ') {
      const payVendorCode = vendorCode || vendorName
      await supabaseInsert('payable_transactions', {
        vendor_code: payVendorCode,
        amount: totalAmount,
        ref_type: 'Inbound',
        ref_id: batchId,
        trans_date: batchDate,
        memo: `입고 ${batchDate} ${vendorName}`,
      })
    }
    return NextResponse.json(
      { success: true, message: `✅ ${validRows.length}건 입고 완료!` },
      { headers }
    )
  } catch (e) {
    console.error('registerInboundBatch:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '입고 저장 실패' },
      { headers }
    )
  }
}
