import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsertMany, supabaseSelectFilter } from '@/lib/supabase-server'
import { sendNoticeToRecipients, getManagersByStore } from '@/lib/send-notice-util'
import { syncReceivableFromForceOutboundStockLogRow } from '@/lib/force-outbound-receivable'
import { isInternalForceOutboundTarget } from '@/lib/internal-outbound'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendInventoryTenantFilter,
  assertInventoryTenantWritable,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  resolveInventoryTenantScope,
  stampInventoryTenantId,
} from '@/lib/inventory-tenant-scope'

/** DB에 `stock_logs.reference_no` 마이그레이션 전인 환경: 해당 키만 제거 후 재시도 */
function stripReferenceNoFromStockLogRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const { reference_no: _rn, ...rest } = r
    return rest
  })
}

/** 강제 출고 - 본사 재고 차감 + 매장 재고 증가 (ForcePush + ForceOutbound) */
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
    const bodyObj = Array.isArray(body) ? null : body && typeof body === 'object' ? (body as Record<string, unknown>) : null
    const referenceNoBatch = bodyObj
      ? String(bodyObj.referenceNo ?? bodyObj.reference_no ?? '')
          .trim()
          .slice(0, 200)
      : ''
    const list = (Array.isArray(body) ? body : (body?.list || [])) as {
      date?: string
      deliveryDate?: string
      store: string
      code: string
      name?: string
      spec?: string
      qty: number | string
    }[]

    if (!list.length) {
      return NextResponse.json(
        { success: false, message: '출고할 목록이 없습니다.' },
        { headers }
      )
    }
    if (!referenceNoBatch) {
      return NextResponse.json(
        { success: false, message: '세금계산서/참조번호(reference_no)는 필수입니다.' },
        { status: 400, headers }
      )
    }

    const uniqCodes = [
      ...new Set(
        list
          .map((d) => String(d.code || '').trim())
          .filter(Boolean)
      ),
    ]
    const priceByCode: Record<string, number> = {}
    if (uniqCodes.length > 0) {
      const codeFilter = `code=in.(${uniqCodes.join(',')})`
      const itemRows = (await supabaseSelectFilter('items', appendInventoryTenantFilter(codeFilter, tenantScope), {
        select: 'code,price',
        limit: uniqCodes.length + 20,
      })) as { code?: string; price?: number | null }[]
      for (const ir of itemRows || []) {
        const c = String(ir.code || '').trim()
        if (c) priceByCode[c] = Number(ir.price) || 0
      }
    }

    const rows: Record<string, unknown>[] = []
    for (const d of list) {
      const qty = parseFloat(String(d.qty || 0).replace(/,/g, '')) || 0
      if (qty <= 0) continue
      const store = String(d.store || '').trim()
      const code = String(d.code || '').trim()
      if (!store || !code) continue

      const dateObj = d.date ? new Date(d.date) : new Date()
      const dateIso = dateObj.toISOString()
      const deliveryDate = (d.deliveryDate && String(d.deliveryDate).trim()) || null
      const isInternalUse = isInternalForceOutboundTarget(store)

      const snapPrice = priceByCode[code]
      const invoiceUnit =
        isInternalUse
          ? 0
          : snapPrice != null && Number.isFinite(snapPrice) && snapPrice >= 0
            ? snapPrice
            : null

      const refPatch = { reference_no: referenceNoBatch }
      rows.push(stampInventoryTenantId({
        location: store,
        item_code: code,
        item_name: String(d.name || '').trim(),
        spec: String(d.spec || '').trim() || '-',
        qty,
        log_date: dateIso,
        vendor_target: 'HQ',
        log_type: 'ForcePush',
        delivery_status: deliveryDate,
        invoice_unit_price: invoiceUnit,
        ...refPatch,
      }, tenantScope))
      rows.push(stampInventoryTenantId({
        location: '본사',
        item_code: code,
        item_name: String(d.name || '').trim(),
        spec: String(d.spec || '').trim() || '-',
        qty: -qty,
        log_date: dateIso,
        vendor_target: store,
        log_type: 'ForceOutbound',
        delivery_status: deliveryDate,
        invoice_unit_price: invoiceUnit,
        ...refPatch,
      }, tenantScope))
    }

    if (!rows.length) {
      return NextResponse.json(
        { success: false, message: '유효한 출고 항목이 없습니다.' },
        { headers }
      )
    }

    let insertedRaw: unknown
    try {
      insertedRaw = await supabaseInsertMany('stock_logs', rows)
    } catch (insertErr) {
      const msg = insertErr instanceof Error ? insertErr.message : String(insertErr)
      const missingRefNoColumn =
        referenceNoBatch &&
        msg.includes('reference_no') &&
        (msg.includes('PGRST204') || msg.includes('schema cache'))
      if (!missingRefNoColumn) throw insertErr
      console.warn(
        'forceOutboundBatch: stock_logs.reference_no column missing; retrying insert without reference_no. Run sql/stock_logs_reference_no.sql on Supabase.'
      )
      insertedRaw = await supabaseInsertMany('stock_logs', stripReferenceNoFromStockLogRows(rows))
    }
    const inserted = (Array.isArray(insertedRaw) ? insertedRaw : []) as {
      id?: number
      log_type?: string
      log_date?: string
      vendor_target?: string
      item_code?: string
      item_name?: string
      qty?: number
      invoice_unit_price?: number | string | null
      reference_no?: string | null
    }[]
    const forceInserted = inserted
      .filter((r) => String(r.log_type || '') === 'ForceOutbound' && r.id != null)
      .map((r) => ({ ...r, reference_no: r.reference_no || referenceNoBatch }))
    for (const r of forceInserted) {
      try {
        await syncReceivableFromForceOutboundStockLogRow(r, { priceByCode, siblingLogs: forceInserted })
      } catch (recErr) {
        console.error('forceOutboundBatch receivable:', recErr)
      }
    }
    const count = Math.floor(rows.length / 2)

    // 앱 내 공지: 출고된 각 매장의 매니저에게 알림
    try {
      const storeToCount = new Map<string, number>()
      for (const d of list) {
        const store = String(d.store || '').trim()
        if (!store) continue
        const qty = parseFloat(String(d.qty || 0).replace(/,/g, '')) || 0
        if (qty <= 0) continue
        storeToCount.set(store, (storeToCount.get(store) || 0) + 1)
      }
      const processorName = String(body?.processorName ?? body?.sender ?? '본사').trim()
      for (const [store, itemCount] of storeToCount) {
        const managers = await getManagersByStore(store)
        if (managers.length > 0) {
          await sendNoticeToRecipients({
            title: `${store} 강제 출고 완료`,
            content: `${itemCount}건의 품목이 해당 매장으로 출고되었습니다. 발주 내역에서 확인해 주세요.`,
            recipients: managers,
            sender: processorName || '본사',
          })
        }
      }
    } catch (noticeErr) {
      console.error('forceOutboundBatch notice:', noticeErr)
    }

    return NextResponse.json(
      { success: true, message: `✅ ${count}건의 강제 출고 및 매장 재고 반영이 완료되었습니다.` },
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
    console.error('forceOutboundBatch:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '출고 처리 실패' },
      { headers }
    )
  }
}
