import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsertMany,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseUpdate,
} from '@/lib/supabase-server'
import { normalizeVendorCode } from '@/lib/vendor-code-policy'
import {
  buildItemTaxMapFromRows,
  inboundLogDateIsoFromBangkokYmd,
} from '@/lib/inbound-payable-amount'
import {
  deleteInboundPayableTransaction,
  computeInboundRegisterTotals,
  syncPayableFromInboundBatch,
  upsertInboundPayableTransaction,
} from '@/lib/inbound-payable-sync'
import { roundErp3 } from '@/lib/utils'
import { inboundPersistLocation } from '@/lib/office-store-canonical'

type InboundLineBody = {
  date?: string
  vendor?: string
  code?: string
  name?: string
  spec?: string
  qty?: number | string
  cost?: number | string
}

async function resolveVendorCode(vendorName: string, preferred?: string | null): Promise<string | null> {
  const pref = normalizeVendorCode(preferred)
  if (pref) return pref
  if (!vendorName) return null
  try {
    const vRows = (await supabaseSelectFilter('vendors', `name=eq.${encodeURIComponent(vendorName)}`, {
      select: 'code',
      limit: 1,
    })) as { code?: string }[]
    if (vRows?.[0]?.code) return String(vRows[0].code).trim()
    const gRows = (await supabaseSelectFilter(
      'vendors',
      `gps_name=eq.${encodeURIComponent(vendorName)}`,
      { select: 'code', limit: 1 }
    )) as { code?: string }[]
    if (gRows?.[0]?.code) return String(gRows[0].code).trim()
  } catch {
    /* vendors 조회 실패 시 null */
  }
  return null
}

/** 입고 배치 수정 — 헤더(거래처·PO·인보이스) 및 품목 단가/수량 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const batchId = Number(body.batchId ?? body.id ?? 0)
    if (!batchId || isNaN(batchId)) {
      return NextResponse.json({ success: false, message: '배치 ID가 필요합니다.' }, { status: 400, headers })
    }

    const existing = (await supabaseSelectFilter('inbound_batches', `id=eq.${batchId}`, {
      limit: 1,
      select: 'id,location,vendor_name,vendor_code',
    })) as {
      id?: number
      location?: string
      vendor_name?: string
      vendor_code?: string
    }[] | null
    if (!existing?.[0]?.id) {
      return NextResponse.json({ success: false, message: '입고 배치를 찾을 수 없습니다.' }, { status: 404, headers })
    }

    const list = (Array.isArray(body.list) ? body.list : null) as InboundLineBody[] | null

    // 헤더만 수정 (인보이스 수령 토글 등)
    if (!list) {
      const patch: Record<string, unknown> = {}
      if (body.vendorName !== undefined) patch.vendor_name = String(body.vendorName || '').trim() || null
      if (body.vendorCode !== undefined) patch.vendor_code = normalizeVendorCode(body.vendorCode) || null
      if (body.poNo !== undefined) patch.po_no = String(body.poNo || '').trim() || null
      if (body.invoiceNo !== undefined) patch.invoice_no = String(body.invoiceNo || '').trim() || null
      if (body.invoicePhotoUrl !== undefined) patch.invoice_photo_url = String(body.invoicePhotoUrl || '').trim() || null
      if (typeof body.invoiceReceived === 'boolean') patch.invoice_received = body.invoiceReceived
      if (body.purchaseOrderId !== undefined) {
        const v = body.purchaseOrderId
        patch.purchase_order_id = v && !isNaN(Number(v)) ? Number(v) : null
      }
      if (body.storeName !== undefined) {
        patch.location = inboundPersistLocation(body.storeName)
      }

      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ success: true, message: '변경 사항이 없습니다.' }, { headers })
      }

      await supabaseUpdate('inbound_batches', batchId, patch)

      if (patch.vendor_code !== undefined) {
        const payables = (await supabaseSelectFilter(
          'payable_transactions',
          `ref_type=eq.Inbound&ref_id=eq.${batchId}`,
          { limit: 1 }
        )) as { id?: number }[]
        if (payables?.[0]?.id) {
          await supabaseUpdate('payable_transactions', payables[0].id, { vendor_code: patch.vendor_code })
        }
      }

      try {
        await syncPayableFromInboundBatch(batchId)
      } catch (syncErr) {
        console.warn('updateInboundBatch payable sync:', syncErr)
      }

      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    if (!list.length) {
      return NextResponse.json({ success: false, message: '저장할 목록이 없습니다.' }, { status: 400, headers })
    }

    const itemRows = (await supabaseSelect('items', {
      order: 'id.asc',
      limit: 5000,
      select: 'code,tax',
    })) as { code?: string; tax?: string | null }[] | null
    const taxByCode = buildItemTaxMapFromRows(itemRows)
    const { grossTotal, batchDateYmd } = computeInboundRegisterTotals(list, taxByCode)

    const vendorName =
      body.vendorName !== undefined
        ? String(body.vendorName || '').trim()
        : String(list[0]?.vendor || '').trim() || String(existing[0].vendor_name || '').trim()

    const preferredCode =
      body.vendorCode !== undefined ? body.vendorCode : existing[0].vendor_code
    const effectiveVendorCode = await resolveVendorCode(vendorName, preferredCode)

    const location =
      body.storeName !== undefined
        ? inboundPersistLocation(body.storeName)
        : inboundPersistLocation(existing[0].location)

    const rows = list.map((item) => {
      const qty = parseFloat(String(item.qty || 0).replace(/,/g, '')) || 0
      const costVal =
        item.cost != null && item.cost !== '' ? parseFloat(String(item.cost).replace(/,/g, '')) : null
      const lineYmd = String(item.date || batchDateYmd).trim().slice(0, 10)
      const row: Record<string, unknown> = {
        location,
        item_code: String(item.code || '').trim(),
        item_name: String(item.name || '').trim(),
        spec: String(item.spec || '').trim() || '-',
        qty,
        log_date: inboundLogDateIsoFromBangkokYmd(lineYmd),
        vendor_target: vendorName || String(item.vendor || '').trim(),
        log_type: 'Inbound',
        inbound_batch_id: batchId,
      }
      if (costVal != null && !isNaN(costVal) && costVal >= 0) {
        row.unit_cost = roundErp3(costVal)
      }
      return row
    })

    const validRows = rows.filter((r) => r.item_code && Number(r.qty) > 0)
    if (!validRows.length) {
      return NextResponse.json({ success: false, message: '유효한 품목이 없습니다.' }, { status: 400, headers })
    }

    const batchPatch: Record<string, unknown> = {
      location,
      vendor_name: vendorName || '-',
      vendor_code: effectiveVendorCode,
      batch_date: batchDateYmd,
      total_amount: grossTotal,
    }
    if (body.poNo !== undefined) batchPatch.po_no = String(body.poNo || '').trim() || null
    if (body.invoiceNo !== undefined) batchPatch.invoice_no = String(body.invoiceNo || '').trim() || null
    if (body.purchaseOrderId !== undefined) {
      const v = body.purchaseOrderId
      batchPatch.purchase_order_id = v && !isNaN(Number(v)) ? Number(v) : null
    }

    await supabaseUpdate('inbound_batches', batchId, batchPatch)

    // insert 먼저 → 성공 후 구행 삭제 (delete-first 시 insert 실패하면 재고 유실)
    const oldLogs = (await supabaseSelectFilter('stock_logs', `inbound_batch_id=eq.${batchId}`, {
      select: 'id',
      limit: 5000,
    })) as { id?: number }[] | null
    const oldIds = (oldLogs || [])
      .map((r) => Number(r.id || 0))
      .filter((id) => id > 0)

    await supabaseInsertMany('stock_logs', validRows)

    if (oldIds.length > 0) {
      const chunkSize = 200
      for (let i = 0; i < oldIds.length; i += chunkSize) {
        const chunk = oldIds.slice(i, i + chunkSize)
        await supabaseDeleteByFilter('stock_logs', `id=in.(${chunk.join(',')})`)
      }
    }

    if (grossTotal > 0 && vendorName && vendorName !== 'From HQ') {
      await upsertInboundPayableTransaction({
        batchId,
        vendorCode: effectiveVendorCode || vendorName,
        amount: grossTotal,
        transDate: batchDateYmd,
        memo: `입고 ${batchDateYmd} ${vendorName}`,
      })
    } else {
      try {
        await deleteInboundPayableTransaction(batchId)
      } catch (syncErr) {
        console.warn('updateInboundBatch payable delete:', syncErr)
      }
    }

    return NextResponse.json(
      { success: true, message: `✅ ${validRows.length}건 입고가 수정되었습니다.` },
      { headers }
    )
  } catch (e) {
    console.error('updateInboundBatch:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '수정 실패' },
      { status: 500, headers }
    )
  }
}
