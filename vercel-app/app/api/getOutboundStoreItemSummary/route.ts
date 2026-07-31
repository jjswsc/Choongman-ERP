/**
 * 출고 「매장×품목」집계용 — 매장이 실제로 받은 수량 기준
 *
 * - 발주 수령: Inbound + vendor_target From HQ (직접정산 포함)
 * - 강제출고: ForcePush + vendor_target HQ
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseSelectFilterAllPages } from '@/lib/supabase-server'
import {
  buildForcePushWithOptionalItemFilter,
  buildInboundFromHqWithOptionalItemFilter,
  buildOutboundLogDateFilterLike,
} from '@/lib/outbound-store-item-summary'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  appendInventoryTenantFilter,
  isInventoryTenantQueryBlocked,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  resolveInventoryTenantScope,
} from '@/lib/inventory-tenant-scope'
import { isOfficeStore } from '@/lib/permissions'
import { formatDateBangkok } from '@/lib/outbound-order-line-match'

export const dynamic = 'force-dynamic'

export type StoreItemSummaryLine = {
  date: string
  target: string
  type: 'Force' | 'Outbound'
  name: string
  code: string
  spec: string
  qty: number
  amount: number
  stockLogId?: number
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const itemSearch = String(searchParams.get('itemSearch') || searchParams.get('item') || '').trim()

  if (!startStr || !endStr) {
    return NextResponse.json([], { headers })
  }

  const auth = await getVerifiedAuth(request, { skipSaasGate: true })
  const tenantScope = await resolveInventoryTenantScope({ auth })
  if (isInventoryTenantQueryBlocked(tenantScope)) {
    return NextResponse.json([], { headers })
  }

  try {
    const datePart = buildOutboundLogDateFilterLike(startStr, endStr)
    const inboundFilter = appendInventoryTenantFilter(
      buildInboundFromHqWithOptionalItemFilter(datePart, itemSearch),
      tenantScope
    )
    const forcePushFilter = appendInventoryTenantFilter(
      buildForcePushWithOptionalItemFilter(datePart, itemSearch),
      tenantScope
    )

    const select = 'id,log_type,log_date,location,vendor_target,item_code,item_name,spec,qty'

    const loadLogs = async (filter: string) => {
      try {
        return await supabaseSelectFilterAllPages('stock_logs', filter, {
          order: 'log_date.desc',
          select,
          pageSize: 8000,
          maxRows: 100000,
        })
      } catch (e) {
        const msg = String(e || '').toLowerCase()
        if (!msg.includes('is_deleted') && !msg.includes('42703')) throw e
        const relaxed = filter.replace(/&is_deleted=is\.false/g, '')
        return await supabaseSelectFilterAllPages('stock_logs', relaxed, {
          order: 'log_date.desc',
          select,
          pageSize: 8000,
          maxRows: 100000,
        })
      }
    }

    const [inboundLogs, forcePushLogs, itemPriceRows] = await Promise.all([
      loadLogs(inboundFilter),
      loadLogs(forcePushFilter),
      supabaseSelectFilter('items', appendInventoryTenantFilter('', tenantScope), {
        select: 'code,price,spec',
        limit: 10000,
      }),
    ])

    const priceByCode = new Map<string, { price: number; spec: string }>()
    for (const it of (itemPriceRows || []) as { code?: string; price?: number; spec?: string }[]) {
      const c = String(it.code || '').trim()
      if (!c) continue
      priceByCode.set(c, {
        price: Number(it.price) || 0,
        spec: String(it.spec || '').trim() || '-',
      })
    }

    const lines: StoreItemSummaryLine[] = []
    const pushRow = (
      row: {
        id?: number
        log_date?: string
        location?: string
        item_code?: string
        item_name?: string
        spec?: string
        qty?: number
      },
      type: 'Force' | 'Outbound'
    ) => {
      const store = String(row.location || '').trim()
      if (!store || isOfficeStore(store)) return
      const code = String(row.item_code || '').trim()
      const name = String(row.item_name || '').trim() || code || '-'
      const qty = Math.abs(Number(row.qty) || 0)
      if (qty <= 0) return
      const info = priceByCode.get(code)
      const unit = info?.price || 0
      const rowDate = row.log_date ? new Date(row.log_date) : null
      const dateStr =
        rowDate && !Number.isNaN(rowDate.getTime()) ? formatDateBangkok(rowDate) : startStr
      const sid = Number(row.id)
      lines.push({
        date: dateStr,
        target: store,
        type,
        name,
        code,
        spec: String(row.spec || info?.spec || '').trim() || '-',
        qty,
        amount: unit * qty,
        stockLogId: Number.isFinite(sid) && sid > 0 ? sid : undefined,
      })
    }

    for (const row of (inboundLogs || []) as Parameters<typeof pushRow>[0][]) {
      pushRow(row, 'Outbound')
    }
    for (const row of (forcePushLogs || []) as Parameters<typeof pushRow>[0][]) {
      pushRow(row, 'Force')
    }

    lines.sort((a, b) => b.date.localeCompare(a.date) || a.target.localeCompare(b.target))
    return NextResponse.json(lines, { headers })
  } catch (e) {
    if (tenantScope.enforce && isMissingInventoryTenantIdColumnError(e)) {
      markInventoryTenantIdColumnMissing()
    }
    console.error('getOutboundStoreItemSummary:', e)
    const message = e instanceof Error ? e.message : String(e || 'getOutboundStoreItemSummary failed')
    return NextResponse.json({ error: message }, { status: 500, headers })
  }
}
