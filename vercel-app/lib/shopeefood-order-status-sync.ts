/**
 * ShopeeFood order/status 웹훅 → pos_orders 취소·환불 동기화 (Grab push order state와 동일 정책)
 */

import { TAX_INVOICE_MARKER } from "@/lib/pos-tax-invoice"
import { supabaseSelectFilter, supabaseUpdateByFilter } from "@/lib/supabase-server"
import { logShopeeFoodEvent } from "@/lib/shopeefood-webhook"
import { parseShopeeFoodStoreMap } from "@/lib/shopeefood-order-to-pos"

/** sf_order 앵커 + sf_state (세금계산서 꼬리 유지) */
export function mergeShopeeStateIntoFullMemo(fullMemo: string, orderId: string, newState: string): string {
  const raw = String(fullMemo || "")
  const markerIdx = raw.indexOf(TAX_INVOICE_MARKER)
  const tail = markerIdx >= 0 ? raw.slice(markerIdx) : ""
  const id = String(orderId || "").trim()
  let base = `sf_order:${id}`
  const st = String(newState || "").trim()
  if (st) base += `|sf_state:${st}`
  return base + tail
}

export type ShopeeFoodOrderStatusSyncResult =
  | {
      ok: true
      updated: boolean
      memoUpdated?: boolean
      orderId?: number
      status?: string
      shopeeStatus?: string
    }
  | { ok: false; message: string }

function sfOrderMemoPostgrestIlikeFilter(orderId: string): string {
  const id = String(orderId || "").trim()
  if (!id) return "memo=eq."
  return `memo=ilike.${encodeURIComponent(`%sf_order:${id}%`)}`
}

/** ShopeeFood status → POS status (취소·환불만 — 완료는 POS에서 수동 마감) */
export function mapShopeeFoodStatusToPosStatus(status: string): string | null {
  const s = String(status || "").trim().toUpperCase()
  if (!s) return null
  if (s.includes("REFUND")) return "refunded"
  if (
    s.includes("CANCEL") ||
    s === "FAILED" ||
    s === "REJECTED" ||
    s === "REJECT" ||
    s === "EXPIRED" ||
    s === "TIMEOUT"
  ) {
    return "cancelled"
  }
  return null
}

function canApplyShopeeStatusTransition(prevStatus: string, nextStatus: string): boolean {
  const prev = String(prevStatus || "").trim().toLowerCase()
  const next = String(nextStatus || "").trim().toLowerCase()
  if (!next) return false
  if (!prev) return true
  if (prev === "completed" || prev === "paid" || prev === "cancelled" || prev === "refunded") return false
  if (prev === next) return false
  if (next === "cancelled" || next === "refunded") return true
  return false
}

type PosOrderShopeeSyncRow = { id?: number; status?: string; memo?: string; store_code?: string }

async function findPosOrderRowForShopeeStatusSync(params: {
  orderId: string
  storeId?: string
}): Promise<PosOrderShopeeSyncRow | null> {
  const orderId = String(params.orderId || "").trim()
  if (!orderId) return null

  let filter = sfOrderMemoPostgrestIlikeFilter(orderId)
  const storeId = String(params.storeId || "").trim()
  if (storeId) {
    const storeCode = parseShopeeFoodStoreMap()[storeId]
    if (storeCode) {
      filter += `&store_code=eq.${encodeURIComponent(storeCode)}`
    }
  }

  const rows = (await supabaseSelectFilter("pos_orders", filter, {
    limit: 1,
    select: "id,status,memo,store_code",
  })) as PosOrderShopeeSyncRow[]
  return rows?.[0] ?? null
}

export async function syncShopeeFoodOrderStatusToPos(params: {
  orderId: string
  status: string
  storeId?: string
  indicator?: string
}): Promise<ShopeeFoodOrderStatusSyncResult> {
  const orderId = String(params.orderId || "").trim()
  const incomingStatus = String(params.status || "").trim()
  if (!orderId) return { ok: false, message: "missing id" }
  if (!incomingStatus) return { ok: false, message: "missing status" }

  const nextStatus = mapShopeeFoodStatusToPosStatus(incomingStatus)
  const row = await findPosOrderRowForShopeeStatusSync({
    orderId,
    storeId: params.storeId,
  })

  if (!row?.id) {
    logShopeeFoodEvent("order_status_sync", params.indicator || "", {
      shopeeOrderId: orderId,
      status: incomingStatus,
      syncIgnored: "pos_order_not_found",
    })
    return { ok: false, message: "pos_order_not_found" }
  }

  const prevMemo = String(row.memo ?? "")
  const mergedMemo = mergeShopeeStateIntoFullMemo(prevMemo, orderId, incomingStatus)
  const memoChanged = mergedMemo !== prevMemo

  let statusUpdated = false
  const prevStatus = String(row.status ?? "").trim().toLowerCase()
  if (nextStatus && canApplyShopeeStatusTransition(prevStatus, nextStatus)) {
    await supabaseUpdateByFilter("pos_orders", `id=eq.${Number(row.id)}`, {
      status: nextStatus,
      ...(memoChanged ? { memo: mergedMemo } : {}),
    })
    statusUpdated = true
  } else if (memoChanged) {
    await supabaseUpdateByFilter("pos_orders", `id=eq.${Number(row.id)}`, { memo: mergedMemo })
  }

  const updated = statusUpdated || memoChanged
  logShopeeFoodEvent("order_status_sync", params.indicator || "", {
    shopeeOrderId: orderId,
    status: incomingStatus,
    posOrderId: row.id,
    posStatus: nextStatus,
    updated,
  })

  return {
    ok: true,
    updated,
    memoUpdated: memoChanged,
    orderId: Number(row.id),
    status: nextStatus || undefined,
    shopeeStatus: incomingStatus,
  }
}
