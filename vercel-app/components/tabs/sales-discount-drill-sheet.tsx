"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { getPosSalesDiscountDrillDown, type PosSalesDiscountDrillOrderRow } from "@/lib/api-client"
import {
  combinedKindLabel,
  combinedLayerLabel,
  paymentDiscountRowLabel,
  paymentKindLabel,
  promoKindLabel,
  resolveSalesDiscountDrillExplanation,
} from "@/lib/sales-discount-analytics-labels"
import { normalizePosOrderTypeKey } from "@/lib/pos-sales-order-type-filter"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"

export type SalesDiscountDrillContext = {
  startStr: string
  endStr: string
  storeCodes?: string[]
  pos?: string
  orderTypes?: string[]
}

export type SalesDiscountDrillTarget = {
  layer: "bundle" | "payment"
  kind: string
  rowKey?: string
  label: string
}

type TrFn = (key: string, fallback: string) => string

function formatSalesAmount(n: number) {
  const v = Number(n ?? 0)
  if (!Number.isFinite(v)) return "0"
  return Math.round(v).toLocaleString()
}

function orderTypeLabel(orderType: string, tr: TrFn): string {
  const k = normalizePosOrderTypeKey(orderType)
  if (k === "delivery") return tr("salesAmountKindDelivery", "배달")
  if (k === "takeout") return tr("salesAmountKindTakeout", "포장")
  return tr("salesAmountKindDineIn", "홀")
}

function formatOrderWhen(row: PosSalesDiscountDrillOrderRow): string {
  const raw = String(row.paidAt || row.createdAt || "").trim()
  if (!raw) return "—"
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw.slice(0, 16)
  return d.toLocaleString()
}

function buildPosOrdersHref(ctx: SalesDiscountDrillContext, orderNo: string): string {
  const q = new URLSearchParams()
  q.set("start", ctx.startStr)
  q.set("end", ctx.endStr)
  if (orderNo) q.set("orderNo", orderNo)
  return `/admin/pos-orders?${q.toString()}`
}

export function useSalesDiscountDrillSheet(ctx: SalesDiscountDrillContext, tr: TrFn) {
  const [open, setOpen] = React.useState(false)
  const [target, setTarget] = React.useState<SalesDiscountDrillTarget | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [orders, setOrders] = React.useState<PosSalesDiscountDrillOrderRow[]>([])
  const [truncated, setTruncated] = React.useState(false)
  const [error, setError] = React.useState("")

  const openDrill = React.useCallback((next: SalesDiscountDrillTarget) => {
    setTarget(next)
    setOpen(true)
  }, [])

  React.useEffect(() => {
    if (!open || !target) return
    let cancelled = false
    setLoading(true)
    setError("")
    getPosSalesDiscountDrillDown({
      startStr: ctx.startStr,
      endStr: ctx.endStr,
      stores: ctx.storeCodes,
      pos: ctx.pos,
      orderTypes: ctx.orderTypes,
      layer: target.layer,
      kind: target.kind,
      rowKey: target.rowKey,
    })
      .then((res) => {
        if (cancelled) return
        if (!res.success) {
          setOrders([])
          setError(res.message || tr("salesDiscountDrillLoadFail", "주문 목록을 불러오지 못했습니다."))
          setTruncated(false)
          return
        }
        setOrders(res.orders)
        setTruncated(res.truncated === true)
      })
      .catch(() => {
        if (cancelled) return
        setOrders([])
        setError(tr("salesDiscountDrillLoadFail", "주문 목록을 불러오지 못했습니다."))
        setTruncated(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, target, ctx, tr])

  const title = target
    ? target.layer === "payment" && target.rowKey?.startsWith("coupon::")
      ? paymentDiscountRowLabel({ kind: "coupon", label: target.label }, tr)
      : `${combinedLayerLabel(target.layer, tr)} · ${target.label}`
    : tr("salesDiscountDrillTitle", "할인 상세")

  const explanation =
    target != null ? resolveSalesDiscountDrillExplanation(target.layer, target.kind, tr) : ""

  const sheet = (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{title}</SheetTitle>
          {explanation ? <SheetDescription className="text-left leading-relaxed">{explanation}</SheetDescription> : null}
        </SheetHeader>
        <div className="px-4 pb-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tr("salesDiscountDrillLoading", "주문 목록 불러오는 중…")}
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {tr("salesDiscountDrillEmpty", "해당 조건의 주문이 없습니다.")}
            </p>
          ) : (
            <>
              {truncated ? (
                <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
                  {tr(
                    "salesDiscountDrillTruncated",
                    "조회 한도로 일부 주문만 표시됩니다. 기간을 좁혀 보세요."
                  )}
                </p>
              ) : null}
              <AdminTableScroll className="rounded-md border" hint={false} lockViewport={false}>
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="px-3 py-2 text-left">{tr("salesDiscountDrillColOrderNo", "주문")}</th>
                      <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                      <th className="px-3 py-2 text-left">{tr("salesDiscountDrillColOrderType", "종류")}</th>
                      <th className="px-3 py-2 text-right">{tr("salesAmount", "매출액")}</th>
                      <th className="px-3 py-2 text-right">{tr("salesDiscountDrillColDiscount", "할인액")}</th>
                      <th className="px-3 py-2 text-left">{tr("salesPaymentDiscountReason", "할인 사유")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((row) => (
                      <tr key={row.orderId} className="border-b border-border/60">
                        <td className="px-3 py-1.5">
                          <Link
                            href={buildPosOrdersHref(ctx, row.orderNo)}
                            className="font-mono text-xs text-primary hover:underline"
                          >
                            {row.orderNo || `#${row.orderId}`}
                          </Link>
                          <p className="text-[10px] text-muted-foreground">{formatOrderWhen(row)}</p>
                        </td>
                        <td className="px-3 py-1.5 text-xs">{row.storeCode || "—"}</td>
                        <td className="px-3 py-1.5 text-xs">{orderTypeLabel(row.orderType, tr)}</td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">{formatSalesAmount(row.total)}</td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric text-rose-700 dark:text-rose-300">
                          -{formatSalesAmount(row.discountAmount)}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-muted-foreground">
                          {row.discountReason ||
                            row.couponCode ||
                            row.promoLabel ||
                            row.tableName ||
                            "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableScroll>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                {tr(
                  "salesDiscountDrillFootnote",
                  "주문 번호를 클릭하면 영수증 관리에서 해당 주문을 엽니다."
                )}
              </p>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )

  return { openDrill, sheet }
}

export function salesDiscountDrillTargetFromCombined(row: {
  layer: string
  kind: string
  label?: string
}, tr: TrFn): SalesDiscountDrillTarget {
  return {
    layer: row.layer === "payment" ? "payment" : "bundle",
    kind: row.kind,
    label: combinedKindLabel({ layer: row.layer, kind: row.kind, label: row.label }, tr),
  }
}

export function salesDiscountDrillTargetFromPaymentKind(kind: string, tr: TrFn): SalesDiscountDrillTarget {
  return {
    layer: "payment",
    kind,
    label: paymentKindLabel(kind, tr),
  }
}

export function salesDiscountDrillTargetFromPaymentRow(row: {
  key: string
  kind: string
  label?: string
}, tr: TrFn): SalesDiscountDrillTarget {
  return {
    layer: "payment",
    kind: row.kind,
    rowKey: row.key,
    label: paymentDiscountRowLabel(row, tr),
  }
}

export function salesDiscountDrillTargetFromPromoKind(kind: string, tr: TrFn): SalesDiscountDrillTarget {
  return {
    layer: "bundle",
    kind,
    label: promoKindLabel(kind, tr),
  }
}

export function salesDiscountDrillTargetFromPromoRow(row: {
  key: string
  kind: string
  name?: string
  promoCode?: string
}, tr: TrFn): SalesDiscountDrillTarget {
  return {
    layer: "bundle",
    kind: row.kind,
    rowKey: row.key,
    label: row.name || row.promoCode || promoKindLabel(row.kind, tr),
  }
}
