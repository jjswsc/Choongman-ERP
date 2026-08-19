import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseDeleteByFilter } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendInventoryTenantFilter,
  assertInventoryTenantWritable,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  resolveInventoryTenantScope,
} from '@/lib/inventory-tenant-scope'

/** 입고 배치 삭제 - stock_logs, payable_transactions, inbound_batches 순서로 삭제 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const tenantScope = await resolveInventoryTenantScope({ auth })
    const writeBlock = assertInventoryTenantWritable(tenantScope)
    if (writeBlock) {
      return NextResponse.json({ success: false, message: writeBlock }, { status: 400, headers })
    }
    const body = await request.json()
    const batchId = Number(body.batchId ?? body.id ?? 0)
    if (!batchId || isNaN(batchId)) {
      return NextResponse.json({ success: false, message: '배치 ID가 필요합니다.' }, { status: 400, headers })
    }

    const batchRows = (await supabaseSelectFilter(
      'inbound_batches',
      appendInventoryTenantFilter(`id=eq.${batchId}`, tenantScope),
      { limit: 1 }
    )) as { id?: number }[]
    if (!batchRows?.length) {
      return NextResponse.json({ success: false, message: '해당 입고 배치가 없습니다.' }, { status: 404, headers })
    }

    // 1. payable_transactions 삭제 (ref_type=Inbound, ref_id=batchId)
    await supabaseDeleteByFilter('payable_transactions', `ref_type=eq.Inbound&ref_id=eq.${batchId}`)

    try {
      const { deletePurchaseTaxInvoiceByInboundBatch } = await import(
        '@/lib/purchase-tax-invoice-server'
      )
      await deletePurchaseTaxInvoiceByInboundBatch(batchId)
    } catch (syncErr) {
      console.warn('deleteInboundBatch purchase tax invoice:', syncErr)
    }

    // 2. stock_logs 삭제 (재고 반영 제거)
    await supabaseDeleteByFilter(
      'stock_logs',
      appendInventoryTenantFilter(`inbound_batch_id=eq.${batchId}`, tenantScope)
    )

    // 3. inbound_batches 삭제
    await supabaseDeleteByFilter(
      'inbound_batches',
      appendInventoryTenantFilter(`id=eq.${batchId}`, tenantScope)
    )

    return NextResponse.json({ success: true, message: '삭제되었습니다.' }, { headers })
  } catch (e) {
    if (isMissingInventoryTenantIdColumnError(e)) {
      markInventoryTenantIdColumnMissing()
      return NextResponse.json(
        { success: false, message: 'inventory tenant_id 스키마가 없습니다.' },
        { status: 400, headers }
      )
    }
    console.error('deleteInboundBatch:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 실패' },
      { status: 500, headers }
    )
  }
}
