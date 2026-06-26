import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseInsertMany, supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { deletePayableFromPO } from '@/lib/receivable-payable'
import { buildItemTaxMapFromRows, inboundLogDateIsoFromBangkokYmd } from '@/lib/inbound-payable-amount'
import { computeInboundRegisterTotals } from '@/lib/inbound-payable-sync'
import { roundErp3 } from '@/lib/utils'

/** 입고 등록 저장 - inbound_batches + stock_logs + payable(입고 건별) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const storeName = (typeof body === 'object' && body?.storeName) ? String(body.storeName).trim() : null
    const vendorCode = (typeof body === 'object' && body?.vendorCode) ? String(body.vendorCode).trim() || null : null
    const purchaseOrderId = (typeof body === 'object' && body?.purchaseOrderId) ? Number(body.purchaseOrderId) : null
    const poNo = (typeof body === 'object' && body?.poNo) ? String(body.poNo).trim() || null : null
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

    const itemRows = (await supabaseSelect('items', {
      order: 'id.asc',
      limit: 5000,
      select: 'code,tax',
    })) as { code?: string; tax?: string | null }[] | null
    const taxByCode = buildItemTaxMapFromRows(itemRows)

    const { grossTotal, batchDateYmd } = computeInboundRegisterTotals(list, taxByCode)

    const rows = list.map((item) => {
      const qty = parseFloat(String(item.qty || 0).replace(/,/g, '')) || 0
      const costVal = item.cost != null && item.cost !== '' ? parseFloat(String(item.cost).replace(/,/g, '')) : null
      const cost = costVal != null && !isNaN(costVal) && costVal >= 0 ? costVal : 0
      const lineYmd = String(item.date || batchDateYmd).trim().slice(0, 10)
      const row: Record<string, unknown> = {
        location,
        item_code: String(item.code || '').trim(),
        item_name: String(item.name || '').trim(),
        spec: String(item.spec || '').trim() || '-',
        qty,
        log_date: inboundLogDateIsoFromBangkokYmd(lineYmd),
        vendor_target: String(item.vendor || '').trim(),
        log_type: 'Inbound',
      }
      if (costVal != null && !isNaN(costVal) && costVal >= 0) {
        row.unit_cost = roundErp3(costVal)
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

    // vendor_name → vendor_code 정규화 (vendors 테이블 기준, 통장 연동 매칭용)
    let effectiveVendorCode = vendorCode
    if (!vendorCode && vendorName) {
      try {
        const vRows = (await supabaseSelectFilter(
          'vendors',
          `name=eq.${encodeURIComponent(vendorName)}`,
          { select: 'code', limit: 1 }
        )) as { code?: string }[]
        if (vRows?.[0]?.code) {
          effectiveVendorCode = String(vRows[0].code).trim()
        } else {
          const gRows = (await supabaseSelectFilter(
            'vendors',
            `gps_name=eq.${encodeURIComponent(vendorName)}`,
            { select: 'code', limit: 1 }
          )) as { code?: string }[]
          if (gRows?.[0]?.code) effectiveVendorCode = String(gRows[0].code).trim()
        }
      } catch (_) {
        /* vendors 조회 실패 시 그대로 vendorName 사용 */
      }
    }

    // 1. inbound_batches 생성
    const batchRow: Record<string, unknown> = {
      location,
      vendor_name: vendorName || '-',
      vendor_code: effectiveVendorCode || vendorCode,
      batch_date: batchDateYmd,
      total_amount: grossTotal,
      purchase_order_id: purchaseOrderId && !isNaN(purchaseOrderId) ? purchaseOrderId : null,
    }
    if (poNo) batchRow.po_no = poNo
    if (invoiceNo) batchRow.invoice_no = invoiceNo
    const batchInserted = (await supabaseInsert('inbound_batches', batchRow)) as { id?: number }[]
    const batchId = Array.isArray(batchInserted) && batchInserted[0]?.id ? batchInserted[0].id : null

    // 2. stock_logs에 inbound_batch_id 포함
    const rowsWithBatch = validRows.map((r) => ({ ...r, inbound_batch_id: batchId }))
    await supabaseInsertMany('stock_logs', rowsWithBatch)

    // 3. 미지급금 생성 (입고 건별 VAT 포함 합계, From HQ 제외)
    if (batchId && grossTotal > 0 && vendorName && vendorName !== 'From HQ') {
      const payVendorCode = effectiveVendorCode || vendorCode || vendorName
      await supabaseInsert('payable_transactions', {
        vendor_code: payVendorCode,
        amount: grossTotal,
        ref_type: 'Inbound',
        ref_id: batchId,
        trans_date: batchDateYmd,
        memo: `입고 ${batchDateYmd} ${vendorName}`,
      })
    }
    // 발주 승인으로 쌓인 PO 미지급은 입고 확정 시 Inbound 행으로 대체(중복 잔액 방지)
    if (batchId && purchaseOrderId && !isNaN(purchaseOrderId)) {
      await deletePayableFromPO(purchaseOrderId)
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
