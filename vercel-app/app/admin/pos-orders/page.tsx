"use client"

import * as React from "react"
import { Receipt, Search, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPosOrders, useStoreList, type PosOrder } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { isOfficeRole } from "@/lib/permissions"
import { cn } from "@/lib/utils"

const orderTypeLabels: Record<string, string> = {
  dine_in: "매장",
  takeout: "포장",
  delivery: "배달",
}

const statusLabels: Record<string, string> = {
  pending: "대기",
  paid: "결제완료",
  cooking: "조리중",
  ready: "준비완료",
  completed: "완료",
  cancelled: "취소",
}

export default function PosOrdersPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const [orders, setOrders] = React.useState<PosOrder[]>([])
  const [loading, setLoading] = React.useState(false)
  const [startStr, setStartStr] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [endStr, setEndStr] = React.useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [storeFilter, setStoreFilter] = React.useState("All")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [expandedId, setExpandedId] = React.useState<number | null>(null)

  const canSearchAll = isOfficeRole(auth?.role || "")

  const loadOrders = React.useCallback(() => {
    setLoading(true)
    getPosOrders({
      startStr,
      endStr,
      storeCode: canSearchAll && storeFilter && storeFilter !== "All" ? storeFilter : undefined,
      status: statusFilter,
    })
      .then(setOrders)
      .catch(() => setOrders([]))
      .finally(() => setLoading(false))
  }, [startStr, endStr, storeFilter, statusFilter, canSearchAll])

  React.useEffect(() => {
    loadOrders()
  }, [loadOrders])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Receipt className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("posOrderList") || "POS 주문 내역"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("posOrderListSub") || "매장 POS 주문을 조회합니다."}
            </p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Input
            type="date"
            value={startStr}
            onChange={(e) => setStartStr(e.target.value)}
            className="h-9 w-40 text-sm"
          />
          <span className="text-muted-foreground">~</span>
          <Input
            type="date"
            value={endStr}
            onChange={(e) => setEndStr(e.target.value)}
            className="h-9 w-40 text-sm"
          />
          {canSearchAll && (
            <Select value={storeFilter} onValueChange={setStoreFilter}>
              <SelectTrigger className="h-9 w-28 text-sm">
                <SelectValue placeholder={t("store") || "매장"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t("posStatusAll") || "전체"}</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-32 text-sm">
              <SelectValue placeholder={t("posStatus") || "상태"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("posStatusAll") || "전체"}</SelectItem>
              {Object.entries(statusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="h-9 gap-1.5 px-4" onClick={loadOrders}>
            <Search className="h-4 w-4" />
            {t("itemsBtnSearch") || "조회"}
          </Button>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}

        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-5 py-3 text-[11px] font-bold text-center w-20">
                    {t("posOrderNo") || "주문번호"}
                  </th>
                  <th className="px-5 py-3 text-[11px] font-bold text-center w-20">
                    매장
                  </th>
                  <th className="px-5 py-3 text-[11px] font-bold text-center w-20">
                    {t("posOrderType") || "유형"}
                  </th>
                  <th className="px-5 py-3 text-[11px] font-bold text-center w-24">
                    합계
                  </th>
                  <th className="px-5 py-3 text-[11px] font-bold text-center w-24">
                    {t("posStatus") || "상태"}
                  </th>
                  <th className="px-5 py-3 text-[11px] font-bold text-center w-36">
                    주문일시
                  </th>
                  <th className="px-5 py-3 text-[11px] font-bold text-center w-12" />
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-5 py-12 text-center text-muted-foreground"
                    >
                      {t("itemsNoResults") || "조회된 내역이 없습니다."}
                    </td>
                  </tr>
                ) : (
                  orders.map((o) => (
                    <React.Fragment key={o.id}>
                      <tr
                        className={cn(
                          "border-b cursor-pointer hover:bg-muted/20",
                          expandedId === o.id && "bg-muted/20"
                        )}
                        onClick={() =>
                          setExpandedId((prev) => (prev === o.id ? null : o.id))
                        }
                      >
                        <td className="px-5 py-3">
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                            {o.orderNo}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">{o.storeCode || "-"}</td>
                        <td className="px-5 py-3 text-center">
                          {orderTypeLabels[o.orderType] || o.orderType}
                        </td>
                        <td className="px-5 py-3 text-right font-bold tabular-nums">
                          {o.total?.toLocaleString()} ฿
                        </td>
                        <td className="px-5 py-3 text-center">
                          {statusLabels[o.status] || o.status}
                        </td>
                        <td className="px-5 py-3 text-center text-muted-foreground">
                          {o.createdAt
                            ? new Date(o.createdAt).toLocaleString("ko-KR")
                            : "-"}
                        </td>
                        <td className="px-5 py-3">
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 transition",
                              expandedId === o.id && "rotate-180"
                            )}
                          />
                        </td>
                      </tr>
                      {expandedId === o.id && (
                        <tr className="border-b bg-muted/10">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="space-y-2 text-xs">
                              {o.items?.length ? (
                                o.items.map((it: { name?: string; price?: number; qty?: number }, idx: number) => (
                                  <div
                                    key={idx}
                                    className="flex justify-between text-muted-foreground"
                                  >
                                    <span>
                                      {it.name} × {it.qty ?? 1}
                                    </span>
                                    <span className="tabular-nums">
                                      {((it.price ?? 0) * (it.qty ?? 1)).toLocaleString()}{" "}
                                      ฿
                                    </span>
                                  </div>
                                ))
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
