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
import {
  getPosCashOrderDrillDown,
  type PosCashOrderDrillOrderRow,
} from "@/lib/api-client"
import { normalizePosOrderTypeKey } from "@/lib/pos-sales-order-type-filter"
import { AdminTableScroll } from "@/components/erp/admin-responsive-list"

export type SalesCashOrderDrillContext = {
  startStr: string
  endStr: string
  storeCodes?: string[]
  pos?: string
}

export type SalesCashOrderDrillTarget = {
  storeCode?: string
  date?: string
  /** KPI/행에 표시된 건수·금액 (헤더 대조용) */
  expectedCount?: number
  expectedCash?: number
  label?: string
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

function formatOrderWhen(row: PosCashOrderDrillOrderRow): string {
  const raw = String(row.paidAt || row.createdAt || "").trim()
  if (!raw) return "—"
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return raw.slice(0, 16)
  return d.toLocaleString()
}

function buildPosOrdersHref(ctx: SalesCashOrderDrillContext, orderNo: string): string {
  const q = new URLSearchParams()
  q.set("start", ctx.startStr)
  q.set("end", ctx.endStr)
  if (orderNo) q.set("orderNo", orderNo)
  return `/admin/pos-orders?${q.toString()}`
}

export function useSalesCashOrderDrillSheet(ctx: SalesCashOrderDrillContext, tr: TrFn) {
  const [open, setOpen] = React.useState(false)
  const [target, setTarget] = React.useState<SalesCashOrderDrillTarget | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [orders, setOrders] = React.useState<PosCashOrderDrillOrderRow[]>([])
  const [orderCount, setOrderCount] = React.useState(0)
  const [cashSales, setCashSales] = React.useState(0)
  const [truncated, setTruncated] = React.useState(false)
  const [error, setError] = React.useState("")

  const openDrill = React.useCallback((next: SalesCashOrderDrillTarget) => {
    setTarget(next)
    setOpen(true)
  }, [])

  React.useEffect(() => {
    if (!open || !target) return
    let cancelled = false
    setLoading(true)
    setError("")
    getPosCashOrderDrillDown({
      startStr: ctx.startStr,
      endStr: ctx.endStr,
      stores: ctx.storeCodes,
      pos: ctx.pos,
      store: target.storeCode,
      date: target.date,
    })
      .then((res) => {
        if (cancelled) return
        if (!res.success) {
          setOrders([])
          setOrderCount(0)
          setCashSales(0)
          setError(res.message || tr("salesCashDrillLoadFail", "주문 목록을 불러오지 못했습니다."))
          setTruncated(false)
          return
        }
        setOrders(res.orders)
        setOrderCount(res.orderCount)
        setCashSales(res.cashSales)
        setTruncated(res.truncated === true)
      })
      .catch(() => {
        if (cancelled) return
        setOrders([])
        setOrderCount(0)
        setCashSales(0)
        setError(tr("salesCashDrillLoadFail", "주문 목록을 불러오지 못했습니다."))
        setTruncated(false)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, target, ctx, tr])

  const title =
    target?.label?.trim() ||
    tr("salesCashDrillTitle", "현금 결제 주문")

  const scopeParts: string[] = []
  if (target?.storeCode) scopeParts.push(target.storeCode)
  if (target?.date) scopeParts.push(target.date)
  else if (ctx.startStr && ctx.endStr) {
    scopeParts.push(
      ctx.startStr === ctx.endStr ? ctx.startStr : `${ctx.startStr} ~ ${ctx.endStr}`
    )
  }
  const scopeLine = scopeParts.join(" · ")

  const totalsMatchExpected =
    target?.expectedCount != null &&
    target?.expectedCash != null &&
    Math.abs(orderCount - target.expectedCount) < 0.5 &&
    Math.abs(cashSales - target.expectedCash) < 1

  const sheet = (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-2xl">
        <SheetHeader className="shrink-0 border-b border-border/60 px-5 py-4 pr-12 text-left">
          <SheetTitle className="text-base">{title}</SheetTitle>
          <SheetDescription className="text-left leading-relaxed">
            {scopeLine ? <span className="block">{scopeLine}</span> : null}
            {tr(
              "salesCashDrillHint",
              "payment_cash > 0 인 완료 주문입니다. 주문 번호를 누르면 영수증 관리로 이동합니다."
            )}
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 pb-6 pt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {tr("salesCashDrillLoading", "주문 목록 불러오는 중…")}
            </div>
          ) : error ? (
            <p className="py-8 text-center text-sm text-destructive">{error}</p>
          ) : orders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {tr("salesCashDrillEmpty", "해당 조건의 현금 결제 주문이 없습니다.")}
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap gap-3 text-sm">
                <span className="tabular-nums">
                  {tr("salesCashColCount", "건수")}:{" "}
                  <strong>{orderCount.toLocaleString()}</strong>
                </span>
                <span className="tabular-nums">
                  {tr("salesCashColPos", "POS 현금")}:{" "}
                  <strong>{formatSalesAmount(cashSales)}</strong>
                </span>
              </div>
              {!loading && target?.expectedCount != null && target?.expectedCash != null ? (
                <p
                  className={`mb-3 text-xs ${
                    totalsMatchExpected
                      ? "text-emerald-700 dark:text-emerald-400"
                      : "text-amber-800 dark:text-amber-200"
                  }`}
                >
                  {totalsMatchExpected
                    ? tr("salesCashDrillMatchOk", "화면 합계와 주문 목록 합계가 일치합니다.")
                    : tr(
                        "salesCashDrillMatchWarn",
                        "화면 합계와 목록 합계가 다릅니다. 기간을 좁히거나 다시 조회해 보세요."
                      )}
                </p>
              ) : null}
              {truncated ? (
                <p className="mb-3 text-xs text-amber-700 dark:text-amber-300">
                  {tr(
                    "salesCashDrillTruncated",
                    "조회 한도로 일부 주문만 표시됩니다. 기간을 좁혀 보세요."
                  )}
                </p>
              ) : null}
              <AdminTableScroll className="rounded-md border" hint={false} lockViewport={false}>
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground">
                      <th className="px-3 py-2 text-left">
                        {tr("salesCashDrillColOrderNo", "주문")}
                      </th>
                      <th className="px-3 py-2 text-left">{tr("salesStoreName", "매장명")}</th>
                      <th className="px-3 py-2 text-left">
                        {tr("salesCashDrillColOrderType", "종류")}
                      </th>
                      <th className="px-3 py-2 text-right">
                        {tr("salesCashDrillColCash", "현금")}
                      </th>
                      <th className="px-3 py-2 text-right">{tr("salesAmount", "매출액")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((row, idx) => (
                      <tr
                        key={row.orderId > 0 ? String(row.orderId) : `${row.orderNo}-${idx}`}
                        className="border-b border-border/60"
                      >
                        <td className="px-3 py-1.5">
                          <Link
                            href={buildPosOrdersHref(ctx, row.orderNo.replace(/^#/, ""))}
                            className="font-mono text-xs text-primary hover:underline"
                          >
                            {row.orderNo || (row.orderId > 0 ? `#${row.orderId}` : "—")}
                          </Link>
                          <p className="text-[10px] text-muted-foreground">{formatOrderWhen(row)}</p>
                        </td>
                        <td className="px-3 py-1.5 text-xs">{row.storeCode || "—"}</td>
                        <td className="px-3 py-1.5 text-xs">{orderTypeLabel(row.orderType, tr)}</td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">
                          {formatSalesAmount(row.paymentCash)}
                        </td>
                        <td className="px-3 py-1.5 text-right font-erp-numeric">
                          {formatSalesAmount(row.totalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </AdminTableScroll>
              <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                {tr(
                  "salesCashDrillFootnote",
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
