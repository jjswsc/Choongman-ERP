import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendInventoryTenantFilter,
  isInventoryTenantQueryBlocked,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  resolveInventoryTenantScope,
} from '@/lib/inventory-tenant-scope'

/** 입고 배치 상세 조회 (수정 폼 프리필용) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(request, { skipSaasGate: true })
    const scope = await resolveInventoryTenantScope({ auth })
    if (isInventoryTenantQueryBlocked(scope)) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404, headers })
    }
    const { searchParams } = new URL(request.url)
    const batchId = Number(searchParams.get('batchId') || searchParams.get('id') || 0)
    if (!batchId || isNaN(batchId)) {
      return NextResponse.json({ error: 'batchId required' }, { status: 400, headers })
    }

    const batchRows = (await supabaseSelectFilter(
      'inbound_batches',
      appendInventoryTenantFilter(`id=eq.${batchId}`, scope),
      { limit: 1 }
    )) as {
      id?: number
      location?: string
      vendor_name?: string
      vendor_code?: string
      batch_date?: string
      total_amount?: number
      purchase_order_id?: number | null
      po_no?: string | null
      invoice_no?: string | null
      invoice_photo_url?: string | null
    }[]
    const batch = batchRows?.[0]
    if (!batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404, headers })
    }

    const itemRows = (await supabaseSelectFilter(
      'items',
      appendInventoryTenantFilter('', scope),
      { limit: 5000, select: 'code,spec,cost' }
    )) as {
      code?: string
      spec?: string
      cost?: number
    }[] | null
    const itemMap: Record<string, { spec: string; cost: number }> = {}
    for (const r of itemRows || []) {
      const code = String(r.code || '').trim()
      if (code) itemMap[code] = { spec: r.spec || '-', cost: Number(r.cost) || 0 }
    }

    const logRows = (await supabaseSelectFilter('stock_logs', appendInventoryTenantFilter(`inbound_batch_id=eq.${batchId}`, scope), {
      select: 'item_code,item_name,spec,qty,unit_cost',
      limit: 500,
    })) as { item_code?: string; item_name?: string; spec?: string; qty?: number; unit_cost?: number | null }[] | null

    const items = (logRows || []).map((r) => {
      const code = String(r.item_code || '').trim()
      const info = itemMap[code] || { spec: '-', cost: 0 }
      const qty = Number(r.qty) || 0
      const unitCost = r.unit_cost != null && !isNaN(Number(r.unit_cost)) ? Number(r.unit_cost) : info.cost
      return {
        code,
        name: r.item_name || '-',
        spec: r.spec || info.spec,
        qty,
        unitCost,
        amount: qty * unitCost,
      }
    })

    return NextResponse.json(
      {
        id: batch.id,
        location: batch.location,
        vendorName: batch.vendor_name,
        vendorCode: batch.vendor_code,
        batchDate: batch.batch_date?.slice(0, 10),
        totalAmount: batch.total_amount,
        purchaseOrderId: batch.purchase_order_id,
        poNo: batch.po_no ?? undefined,
        invoiceNo: batch.invoice_no ?? undefined,
        invoicePhotoUrl: batch.invoice_photo_url ?? undefined,
        items,
      },
      { headers }
    )
  } catch (e) {
    if (isMissingInventoryTenantIdColumnError(e)) {
      markInventoryTenantIdColumnMissing()
      return NextResponse.json({ error: 'Batch not found' }, { status: 404, headers })
    }
    console.error('getInboundBatch:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
