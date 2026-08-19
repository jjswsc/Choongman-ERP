import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseInsertMany, supabaseSelectFilter } from '@/lib/supabase-server'
import { deletePayableFromPO } from '@/lib/receivable-payable'
import { buildItemTaxMapFromRows, inboundLogDateIsoFromBangkokYmd } from '@/lib/inbound-payable-amount'
import { computeInboundRegisterTotals, upsertInboundPayableTransaction } from '@/lib/inbound-payable-sync'
import {
  normalizeInboundSourceCurrency,
  parseInboundFxRate,
  resolveInboundLineCost,
  validateInboundFxHeader,
} from '@/lib/inbound-fx'
import { inboundPersistLocation } from '@/lib/office-store-canonical'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendInventoryTenantFilter,
  assertInventoryTenantWritable,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  resolveInventoryTenantScope,
  stampInventoryTenantId,
} from '@/lib/inventory-tenant-scope'

/** 입고 등록 저장 - inbound_batches + stock_logs + payable(입고 건별) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const tenantScope = await resolveInventoryTenantScope({ auth })
    const writeBlock = assertInventoryTenantWritable(tenantScope)
    if (writeBlock) {
      return NextResponse.json({ success: false, message: writeBlock }, { status: 400, headers })
    }
    const body = await request.json()
    const storeName = (typeof body === 'object' && body?.storeName) ? String(body.storeName).trim() : null
    const vendorCode = (typeof body === 'object' && body?.vendorCode) ? String(body.vendorCode).trim() || null : null
    const purchaseOrderId = (typeof body === 'object' && body?.purchaseOrderId) ? Number(body.purchaseOrderId) : null
    const poNo = (typeof body === 'object' && body?.poNo) ? String(body.poNo).trim() || null : null
    const invoiceNo = (typeof body === 'object' && body?.invoiceNo) ? String(body.invoiceNo).trim() || null : null
    const invoiceReceived = typeof body === 'object' && body?.invoiceReceived === true
    const sourceCurrency = normalizeInboundSourceCurrency(
      typeof body === 'object' ? body?.sourceCurrency ?? body?.source_currency : null
    )
    const fxRate = parseInboundFxRate(typeof body === 'object' ? body?.fxRate ?? body?.fx_rate : null)
    const fxHeaderErr = validateInboundFxHeader(sourceCurrency, fxRate)
    if (fxHeaderErr) {
      return NextResponse.json({ success: false, message: fxHeaderErr }, { status: 400, headers })
    }

    const list = (Array.isArray(body) ? body : (body?.list || [])) as {
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

    const location = inboundPersistLocation(storeName)
    const vendorName = String(list[0]?.vendor || '').trim()

    const itemRows = (await supabaseSelectFilter('items', appendInventoryTenantFilter('', tenantScope), {
      order: 'id.asc',
      limit: 5000,
      select: 'code,tax',
    })) as { code?: string; tax?: string | null }[] | null
    const taxByCode = buildItemTaxMapFromRows(itemRows)

    const resolvedLines: {
      date?: string
      vendor?: string
      code?: string
      name?: string
      spec?: string
      qty?: number | string
      cost?: number | string
      unitCostThb: number | null
      sourceUnitCost: number | null
    }[] = []

    for (const item of list) {
      const resolved = resolveInboundLineCost({
        costRaw: item.cost,
        sourceCurrency,
        fxRate,
      })
      if (!resolved.ok) {
        return NextResponse.json({ success: false, message: resolved.message }, { status: 400, headers })
      }
      resolvedLines.push({
        ...item,
        cost: resolved.unitCostThb != null ? resolved.unitCostThb : item.cost,
        unitCostThb: resolved.unitCostThb,
        sourceUnitCost: resolved.sourceUnitCost,
      })
    }

    const { grossTotal, batchDateYmd } = computeInboundRegisterTotals(resolvedLines, taxByCode)

    const rows = resolvedLines.map((item) => {
      const qty = parseFloat(String(item.qty || 0).replace(/,/g, '')) || 0
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
      if (item.unitCostThb != null) {
        row.unit_cost = item.unitCostThb
      }
      if (sourceCurrency === 'KRW' && item.sourceUnitCost != null) {
        row.source_unit_cost = item.sourceUnitCost
      } else {
        row.source_unit_cost = null
      }
      return stampInventoryTenantId(row, tenantScope)
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
      source_currency: sourceCurrency,
      fx_rate: sourceCurrency === 'KRW' ? fxRate : null,
    }
    if (poNo) batchRow.po_no = poNo
    if (invoiceNo) batchRow.invoice_no = invoiceNo
    if (invoiceReceived) batchRow.invoice_received = true
    const batchInserted = (await supabaseInsert(
      'inbound_batches',
      stampInventoryTenantId(batchRow, tenantScope)
    )) as { id?: number }[]
    const batchId = Array.isArray(batchInserted) && batchInserted[0]?.id ? batchInserted[0].id : null

    // 2. stock_logs에 inbound_batch_id 포함
    const rowsWithBatch = validRows.map((r) => ({ ...r, inbound_batch_id: batchId }))
    await supabaseInsertMany('stock_logs', rowsWithBatch)

    // 3. 미지급금 생성 (입고 건별 VAT 포함 합계, From HQ 제외)
    if (batchId && grossTotal > 0 && vendorName && vendorName !== 'From HQ') {
      const payVendorCode = effectiveVendorCode || vendorCode || vendorName
      await upsertInboundPayableTransaction({
        batchId,
        vendorCode: payVendorCode,
        amount: grossTotal,
        transDate: batchDateYmd,
        memo: `입고 ${batchDateYmd} ${vendorName}`,
      })
    }
    // 발주 승인으로 쌓인 PO 미지급은 입고 확정 시 Inbound 행으로 대체(중복 잔액 방지)
    if (batchId && purchaseOrderId && !isNaN(purchaseOrderId)) {
      await deletePayableFromPO(purchaseOrderId)
    }
    if (batchId) {
      try {
        const { syncPurchaseTaxInvoiceFromInboundBatch } = await import(
          '@/lib/purchase-tax-invoice-inbound-sync'
        )
        await syncPurchaseTaxInvoiceFromInboundBatch(batchId)
      } catch (syncErr) {
        console.warn('registerInboundBatch purchase tax invoice sync:', syncErr)
      }
    }
    return NextResponse.json(
      { success: true, message: `✅ ${validRows.length}건 입고 완료!` },
      { headers }
    )
  } catch (e) {
    if (isMissingInventoryTenantIdColumnError(e)) {
      markInventoryTenantIdColumnMissing()
      return NextResponse.json(
        { success: false, message: 'inventory tenant_id 스키마가 없습니다.' },
        { status: 400, headers }
      )
    }
    console.error('registerInboundBatch:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '입고 저장 실패' },
      { headers }
    )
  }
}
