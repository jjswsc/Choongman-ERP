import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseRpc,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseUpdate,
  supabaseDeleteByFilter,
} from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'
import { reserveRequestIdempotencyKey } from '@/lib/request-idempotency'
import { canDeleteOutbound } from '@/lib/permissions'
import { hasJournalForSource } from '@/lib/accounting-posting'
import { syncReceivableToOutboundView } from '@/lib/receivable-match-outbound'
import { syncReceivableFromForceOutboundStockLogById } from '@/lib/force-outbound-receivable'
import { findReceivedCartLineIndex, type OrderCartLine } from '@/lib/outbound-order-line-match'
import { projectOutstandingAfterDelete } from '@/lib/outbound-delete-precheck'

type DeleteMode = 'order' | 'force'

type StockLogRow = {
  id?: number
  log_type?: string
  order_id?: number | null
  vendor_target?: string | null
  item_code?: string | null
  item_name?: string | null
  qty?: number | string | null
  reference_no?: string | null
}

type DeletePreviewConflict = {
  kind: 'journal_exists' | 'over_receive'
  message: string
  store?: string
  orderId?: number
}

function parseDeleteMode(v: unknown): DeleteMode | null {
  const s = String(v || '').trim().toLowerCase()
  if (s === 'order') return 'order'
  if (s === 'force') return 'force'
  return null
}

function parseStockLogIds(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.floor(n))
}

function parseJsonNumberArray(raw: unknown): number[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((n) => Math.floor(n))
}

function parseJsonStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.map((x) => String(x || '').trim()).filter(Boolean)
}

async function loadTargetRows(params: {
  mode: DeleteMode
  orderId?: number
  referenceNo?: string
  stockLogIds?: number[]
}): Promise<StockLogRow[]> {
  const selectCols = 'id,log_type,order_id,vendor_target,item_code,item_name,qty,reference_no'
  if (params.mode === 'order') {
    const orderId = Number(params.orderId || 0)
    if (!orderId) return []
    return (await supabaseSelectFilterAllPages(
      'stock_logs',
      `log_type=eq.Outbound&order_id=eq.${orderId}&is_deleted=is.false`,
      { order: 'id.asc', select: selectCols, pageSize: 3000, maxRows: 30000 }
    )) as StockLogRow[]
  }

  const uniq = new Map<number, StockLogRow>()
  const ref = String(params.referenceNo || '').trim()
  const ids = params.stockLogIds || []
  if (ref) {
    const rows = (await supabaseSelectFilterAllPages(
      'stock_logs',
      `log_type=in.(ForceOutbound,ForcePush)&reference_no=eq.${encodeURIComponent(ref)}&is_deleted=is.false`,
      { order: 'id.asc', select: selectCols, pageSize: 3000, maxRows: 30000 }
    )) as StockLogRow[]
    for (const r of rows || []) {
      const id = Number(r.id)
      if (id > 0) uniq.set(id, r)
    }
  }
  if (ids.length > 0) {
    const idFilter = `id=in.(${ids.join(',')})`
    const rows = (await supabaseSelectFilter(
      'stock_logs',
      `${idFilter}&log_type=in.(ForceOutbound,ForcePush)&is_deleted=is.false`,
      { select: selectCols, limit: Math.min(20000, Math.max(200, ids.length + 20)), order: 'id.asc' }
    )) as StockLogRow[]
    for (const r of rows || []) {
      const id = Number(r.id)
      if (id > 0) uniq.set(id, r)
    }
  }
  return [...uniq.values()].sort((a, b) => Number(a.id || 0) - Number(b.id || 0))
}

async function sumReceivableForStores(storeNames: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const store of storeNames) {
    const rows = (await supabaseSelectFilterAllPages(
      'receivable_transactions',
      `store_name=eq.${encodeURIComponent(store)}`,
      { select: 'amount', order: 'id.asc', pageSize: 4000, maxRows: 200000 }
    )) as { amount?: number | string }[]
    let total = 0
    for (const r of rows || []) total += Number(r.amount || 0)
    out[store] = total
  }
  return out
}

async function computeDeleteAmountByStore(params: {
  orderIds: number[]
  forceOutboundIds: number[]
}): Promise<Record<string, number>> {
  const result: Record<string, number> = {}
  if (params.orderIds.length > 0) {
    const rows = (await supabaseSelectFilter(
      'receivable_transactions',
      `ref_type=eq.Order&ref_id=in.(${params.orderIds.join(',')})`,
      { select: 'store_name,amount', limit: Math.min(50000, params.orderIds.length * 5 + 50) }
    )) as { store_name?: string; amount?: number | string }[]
    for (const r of rows || []) {
      const store = String(r.store_name || '').trim()
      if (!store) continue
      result[store] = (result[store] || 0) + Number(r.amount || 0)
    }
  }
  if (params.forceOutboundIds.length > 0) {
    const rows = (await supabaseSelectFilter(
      'receivable_transactions',
      `ref_type=eq.ForceOutbound&ref_id=in.(${params.forceOutboundIds.join(',')})`,
      { select: 'store_name,amount', limit: Math.min(80000, params.forceOutboundIds.length * 2 + 100) }
    )) as { store_name?: string; amount?: number | string }[]
    for (const r of rows || []) {
      const store = String(r.store_name || '').trim()
      if (!store) continue
      result[store] = (result[store] || 0) + Number(r.amount || 0)
    }
  }
  return result
}

async function recomputeOrderDeliveryStatus(orderId: number): Promise<void> {
  if (!orderId || Number.isNaN(orderId)) return
  const rows = (await supabaseSelectFilter(
    'orders',
    `id=eq.${orderId}`,
    { select: 'id,cart_json', limit: 1 }
  )) as { id?: number; cart_json?: string }[]
  const o = rows?.[0]
  if (!o?.id) return
  let cart: OrderCartLine[] = []
  try {
    if (o.cart_json) cart = JSON.parse(o.cart_json) || []
  } catch {
    cart = []
  }
  const logs = (await supabaseSelectFilter(
    'stock_logs',
    `log_type=eq.Outbound&order_id=eq.${orderId}&is_deleted=is.false`,
    { select: 'item_code,item_name', limit: 5000, order: 'id.asc' }
  )) as { item_code?: string; item_name?: string }[]

  if (!logs?.length) {
    await supabaseUpdate('orders', orderId, {
      delivery_status: '배송중',
      received_indices: JSON.stringify([]),
    })
    return
  }
  const allIndices = cart.map((_, idx) => idx)
  const used = new Set<number>()
  for (const log of logs) {
    const hit = findReceivedCartLineIndex(
      cart,
      allIndices.filter((idx) => !used.has(idx)),
      String(log.item_code || '').trim(),
      String(log.item_name || '').trim()
    )
    if (hit >= 0) used.add(hit)
  }
  const receivedIndices = [...used].sort((a, b) => a - b)
  const isAllReceived = cart.length > 0 && receivedIndices.length >= cart.length
  await supabaseUpdate('orders', orderId, {
    delivery_status: isAllReceived ? '배송완료' : '일부배송완료',
    received_indices: JSON.stringify(receivedIndices),
  })
}

function parseReceivedIndices(raw: unknown): number[] {
  if (raw == null) return []
  if (Array.isArray(raw)) {
    return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0)
  }
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0)
  } catch {
    return []
  }
}

type ApprovedOrderCancelPreview = {
  orderCancelWithoutOutboundLogs: true
  orderIds: number[]
  forceOutboundIds: number[]
  stores: string[]
  restoreByLocation: Record<string, number>
  receivableDeleteByStore: Record<string, number>
  projectedOutstandingByStore: Record<string, number>
  conflicts: DeletePreviewConflict[]
}

async function buildApprovedOrderCancelPreview(orderId: number): Promise<
  | { ok: false; message: string; status: number }
  | { ok: true; preview: ApprovedOrderCancelPreview }
> {
  const orders = (await supabaseSelectFilter('orders', `id=eq.${orderId}`, {
    limit: 1,
    select: 'id,status,store_name,delivery_status,received_indices',
  })) as {
    id?: number
    status?: string
    store_name?: string
    delivery_status?: string
    received_indices?: string | number[] | null
  }[]
  const o = orders?.[0]
  if (!o?.id) {
    return { ok: false, message: '해당 주문을 찾을 수 없습니다.', status: 404 }
  }
  const status = String(o.status || '').trim()
  if (status !== 'Approved') {
    return {
      ok: false,
      message:
        status === 'Rejected'
          ? '이미 반려·취소된 주문입니다.'
          : '출고 로그가 없고, 승인(Approved) 상태 주문만 출고 화면에서 취소할 수 있습니다.',
      status: 409,
    }
  }
  const received = parseReceivedIndices(o.received_indices)
  if (received.length > 0) {
    return {
      ok: false,
      message: '매장 수령이 시작된 주문은 여기서 취소할 수 없습니다. 출고 로그 삭제 또는 수령 조정이 필요합니다.',
      status: 409,
    }
  }
  const ds = String(o.delivery_status || '').trim()
  if (ds === '배송완료' || ds === '일부배송완료') {
    return {
      ok: false,
      message: '배송 완료(또는 일부 완료) 주문은 출고 삭제로 취소할 수 없습니다.',
      status: 409,
    }
  }

  const hasJournal = await hasJournalForSource('store_purchase', orderId)
  const conflicts: DeletePreviewConflict[] = []
  if (hasJournal) {
    conflicts.push({
      kind: 'journal_exists',
      orderId,
      message: `주문 ${orderId}는 회계 분개(store_purchase)가 존재하여 취소를 차단했습니다.`,
    })
  }

  const storeName = String(o.store_name || '').trim()
  const receivableDeleteByStore = await computeDeleteAmountByStore({ orderIds: [orderId], forceOutboundIds: [] })
  const allStores = [...new Set([storeName, ...Object.keys(receivableDeleteByStore)].filter(Boolean))]
  const currentOutstanding = await sumReceivableForStores(allStores)
  const projection = projectOutstandingAfterDelete({
    currentOutstandingByStore: currentOutstanding,
    deletingReceivableByStore: receivableDeleteByStore,
  })
  for (const hit of projection.overReceivedStores) {
    conflicts.push({
      kind: 'over_receive',
      store: hit.store,
      message: `${hit.store}는 취소 후 미수금이 음수(${hit.projected.toLocaleString()})가 되어 수금 초과 상태가 됩니다.`,
    })
  }

  return {
    ok: true,
    preview: {
      orderCancelWithoutOutboundLogs: true,
      orderIds: [orderId],
      forceOutboundIds: [],
      stores: allStores,
      restoreByLocation: {},
      receivableDeleteByStore,
      projectedOutstandingByStore: projection.projectedByStore,
      conflicts,
    },
  }
}

async function cancelApprovedOrderWithoutOutboundLogs(params: {
  orderId: number
  reason: string
}): Promise<{ ok: true } | { ok: false; message: string; status: number; conflicts?: DeletePreviewConflict[] }> {
  const built = await buildApprovedOrderCancelPreview(params.orderId)
  if (!built.ok) {
    return { ok: false, message: built.message, status: built.status }
  }
  if (built.preview.conflicts.length > 0) {
    return {
      ok: false,
      message: '취소 전 충돌이 발견되어 중단했습니다. (회계 분개/수금 초과 확인)',
      status: 409,
      conflicts: built.preview.conflicts,
    }
  }
  await supabaseUpdate('orders', params.orderId, {
    status: 'Rejected',
    reject_reason: params.reason,
  })
  await supabaseDeleteByFilter(
    'receivable_transactions',
    `ref_type=eq.Order&ref_id=eq.${params.orderId}`
  )
  return { ok: true }
}

async function buildPreview(mode: DeleteMode, rows: StockLogRow[]): Promise<{
  orderIds: number[]
  forceOutboundIds: number[]
  stores: string[]
  restoreByLocation: Record<string, number>
  receivableDeleteByStore: Record<string, number>
  projectedOutstandingByStore: Record<string, number>
  conflicts: DeletePreviewConflict[]
}> {
  const orderIds = [...new Set(rows.map((r) => Number(r.order_id || 0)).filter((n) => n > 0))]
  const forceOutboundIds = [...new Set(
    rows
      .filter((r) => String(r.log_type || '') === 'ForceOutbound')
      .map((r) => Number(r.id || 0))
      .filter((n) => n > 0)
  )]
  const stores = [...new Set(rows.map((r) => String(r.vendor_target || '').trim()).filter(Boolean))]
  const restoreByLocation: Record<string, number> = {}
  for (const r of rows) {
    const qty = Number(r.qty || 0)
    if (!Number.isFinite(qty) || qty === 0) continue
    const loc = qty < 0 ? '본사' : String(r.vendor_target || '').trim() || '미지정'
    const delta = qty < 0 ? Math.abs(qty) : -Math.abs(qty)
    restoreByLocation[loc] = (restoreByLocation[loc] || 0) + delta
  }

  const conflicts: DeletePreviewConflict[] = []
  if (mode === 'order') {
    for (const orderId of orderIds) {
      const hasJournal = await hasJournalForSource('store_purchase', orderId)
      if (hasJournal) {
        conflicts.push({
          kind: 'journal_exists',
          orderId,
          message: `주문 ${orderId}는 회계 분개(store_purchase)가 존재하여 자동 삭제를 차단했습니다.`,
        })
      }
    }
  }

  const receivableDeleteByStore = await computeDeleteAmountByStore({ orderIds, forceOutboundIds })
  const allStores = [...new Set([...stores, ...Object.keys(receivableDeleteByStore)])]
  const currentOutstanding = await sumReceivableForStores(allStores)
  const projection = projectOutstandingAfterDelete({
    currentOutstandingByStore: currentOutstanding,
    deletingReceivableByStore: receivableDeleteByStore,
  })
  const projectedOutstandingByStore = projection.projectedByStore
  for (const hit of projection.overReceivedStores) {
    conflicts.push({
      kind: 'over_receive',
      store: hit.store,
      message: `${hit.store}는 삭제 후 미수금이 음수(${hit.projected.toLocaleString()})가 되어 수금 초과 상태가 됩니다.`,
    })
  }

  return {
    orderIds,
    forceOutboundIds,
    stores: allStores,
    restoreByLocation,
    receivableDeleteByStore,
    projectedOutstandingByStore,
    conflicts,
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  try {
    const authResult = await requireAuth(request, 'office')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      authResult.errorResponse.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
      authResult.errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
      return authResult.errorResponse
    }
    if (!canDeleteOutbound(authResult.auth.role || '')) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }

    const body = (await request.json()) as {
      mode?: string
      orderId?: number | string
      referenceNo?: string
      stockLogIds?: number[]
      reason?: string
      dryRun?: boolean
      idempotencyKey?: string
    }
    const mode = parseDeleteMode(body.mode)
    if (!mode) {
      return NextResponse.json({ success: false, message: 'mode(order|force)가 필요합니다.' }, { status: 400, headers })
    }
    const dryRun = Boolean(body.dryRun)
    const orderId = Math.floor(Number(body.orderId || 0))
    const referenceNo = String(body.referenceNo || '').trim()
    const stockLogIds = parseStockLogIds(body.stockLogIds)
    const reason = String(body.reason || '').trim()
    const idempotencyKey = String(
      request.headers.get('x-idempotency-key') ?? body.idempotencyKey ?? ''
    ).trim()

    if (mode === 'order' && orderId <= 0) {
      return NextResponse.json({ success: false, message: 'orderId가 필요합니다.' }, { status: 400, headers })
    }
    if (mode === 'force' && !referenceNo && stockLogIds.length === 0) {
      return NextResponse.json(
        { success: false, message: '강제출고 삭제는 referenceNo 또는 stockLogIds가 필요합니다.' },
        { status: 400, headers }
      )
    }
    if (!dryRun && !reason) {
      return NextResponse.json({ success: false, message: '삭제 사유(reason)를 입력해 주세요.' }, { status: 400, headers })
    }

    const targetRows = await loadTargetRows({ mode, orderId, referenceNo, stockLogIds })
    if (!targetRows.length) {
      if (mode === 'order' && orderId > 0) {
        const cancelBuilt = await buildApprovedOrderCancelPreview(orderId)
        if (!cancelBuilt.ok) {
          return NextResponse.json(
            { success: false, message: cancelBuilt.message },
            { status: cancelBuilt.status, headers }
          )
        }
        const cancelPreview = cancelBuilt.preview
        if (dryRun) {
          return NextResponse.json(
            {
              success: true,
              dryRun: true,
              targetCount: 0,
              mode,
              orderId,
              ...cancelPreview,
            },
            { headers }
          )
        }
        if (cancelPreview.conflicts.length > 0) {
          return NextResponse.json(
            {
              success: false,
              message: '취소 전 충돌이 발견되어 중단했습니다. (회계 분개/수금 초과 확인)',
              conflicts: cancelPreview.conflicts,
              preview: cancelPreview,
            },
            { status: 409, headers }
          )
        }
        if (idempotencyKey) {
          const duplicated = await reserveRequestIdempotencyKey({
            scope: 'cancel-approved-order-without-outbound',
            key: idempotencyKey,
            payload: { orderId },
          })
          if (duplicated) {
            return NextResponse.json(
              { success: true, duplicated: true, message: '이미 처리된 취소 요청입니다.' },
              { headers }
            )
          }
        }
        const cancelled = await cancelApprovedOrderWithoutOutboundLogs({ orderId, reason })
        if (!cancelled.ok) {
          return NextResponse.json(
            {
              success: false,
              message: cancelled.message,
              conflicts: cancelled.conflicts,
            },
            { status: cancelled.status, headers }
          )
        }
        return NextResponse.json(
          {
            success: true,
            message: `승인 주문 #${orderId}을(를) 취소(반려)했습니다. (출고 전 — 출고 로그 없음)`,
            deletedCount: 0,
            mode,
            orderIds: [orderId],
            orderCancelWithoutOutboundLogs: true,
            preview: cancelPreview,
          },
          { headers }
        )
      }
      return NextResponse.json(
        {
          success: false,
          message: '삭제 가능한 활성 출고 로그를 찾지 못했습니다.',
          preview: { targetCount: 0, conflicts: [] },
        },
        { status: 404, headers }
      )
    }

    const preview = await buildPreview(mode, targetRows)
    if (dryRun) {
      return NextResponse.json(
        {
          success: true,
          dryRun: true,
          targetCount: targetRows.length,
          mode,
          orderId: mode === 'order' ? orderId : undefined,
          referenceNo: referenceNo || undefined,
          ...preview,
        },
        { headers }
      )
    }

    if (preview.conflicts.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: '삭제 전 충돌이 발견되어 중단했습니다. (회계 분개/수금 초과 확인)',
          targetCount: targetRows.length,
          conflicts: preview.conflicts,
          preview,
        },
        { status: 409, headers }
      )
    }

    if (idempotencyKey) {
      const duplicated = await reserveRequestIdempotencyKey({
        scope: 'delete-outbound-soft',
        key: idempotencyKey,
        payload: { mode, orderId, referenceNo, stockLogIds: stockLogIds.slice(0, 100) },
      })
      if (duplicated) {
        return NextResponse.json(
          { success: true, duplicated: true, message: '이미 처리된 삭제 요청입니다.' },
          { headers }
        )
      }
    }

    const rpcResultRaw = await supabaseRpc<Record<string, unknown>>('soft_delete_outbound_logs', {
      p_mode: mode,
      p_reason: reason,
      p_deleted_by:
        (() => {
          const a = authResult.auth
          const idPart = a.employeeId != null ? `e${a.employeeId}` : ""
          return String([idPart, a.name, a.employeeCode].filter(Boolean).join(" · ")).trim() || null
        })(),
      p_request_key: idempotencyKey || null,
      p_order_id: mode === 'order' ? orderId : null,
      p_reference_no: mode === 'force' && referenceNo ? referenceNo : null,
      p_stock_log_ids: mode === 'force' && stockLogIds.length > 0 ? stockLogIds : null,
    })

    const rpcResult = (rpcResultRaw || {}) as Record<string, unknown>
    const deletedCount = Number(rpcResult.deleted_count || 0)
    const orderIds = parseJsonNumberArray(rpcResult.order_ids)
    const forceOutboundIds = parseJsonNumberArray(rpcResult.force_outbound_ids)
    const warnings: string[] = []

    for (const oid of orderIds) {
      try {
        const syncResult = await syncReceivableToOutboundView(oid)
        if (!syncResult.ok) warnings.push(`주문 ${oid} 미수금 동기화: ${syncResult.message || '실패'}`)
      } catch (e) {
        warnings.push(`주문 ${oid} 미수금 동기화 오류: ${e instanceof Error ? e.message : String(e)}`)
      }
      try {
        await recomputeOrderDeliveryStatus(oid)
      } catch (e) {
        warnings.push(`주문 ${oid} 배송상태 재계산 오류: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    for (const stockLogId of forceOutboundIds) {
      try {
        await syncReceivableFromForceOutboundStockLogById(stockLogId)
      } catch (e) {
        warnings.push(`강제출고 ${stockLogId} 미수금 동기화 오류: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: `소프트 삭제 완료 (${deletedCount}건)`,
        deletedCount,
        mode,
        orderIds,
        forceOutboundIds,
        stores: parseJsonStringArray(rpcResult.stores),
        eventId: Number(rpcResult.event_id || 0) || undefined,
        preview,
        warnings,
      },
      { headers }
    )
  } catch (e) {
    console.error('deleteOutbound:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 처리 실패' },
      { status: 500, headers }
    )
  }
}

export async function OPTIONS() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return new NextResponse(null, { status: 204, headers })
}
