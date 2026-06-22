"use client"

import * as React from "react"
import { Loader2, X } from "lucide-react"
import { formatBaht, formatDateTime } from "@/components/member-portal/portal-ui"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import { memberPortalOrderStatusLabelKey } from "@/lib/member-portal-orders-list-shared"
import {
  MP_MAX_WIDTH,
  MP_SHEET_BOTTOM_OFFSET,
  MP_SHEET_MAX_HEIGHT_ABOVE_NAV,
  MP_CARD_TEXT_MUTED,
  MP_CARD_TEXT_PRIMARY,
  MP_CARD_TEXT_SECONDARY,
} from "@/lib/member-portal-design"
import type { MemberPortalOrderItemRow } from "@/lib/member-portal-order-items-parse"

type OrderDetail = {
  orderId: number
  orderNo: string
  storeCode: string
  status: string
  total: number
  pickupHint: string
  createdAt: string
  items: MemberPortalOrderItemRow[]
}

type MemberPortalOrderDetailSheetProps = {
  open: boolean
  orderId: number
  storeLabel: string
  dateLocale: string
  closeLabel: string
  onClose: () => void
  t: (key: MemberPortalKey, params?: Record<string, string>) => string
}

export function MemberPortalOrderDetailSheet({
  open,
  orderId,
  storeLabel,
  dateLocale,
  closeLabel,
  onClose,
  t,
}: MemberPortalOrderDetailSheetProps) {
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")
  const [detail, setDetail] = React.useState<OrderDetail | null>(null)

  React.useEffect(() => {
    if (!open || !orderId) {
      setDetail(null)
      setError("")
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError("")
    setDetail(null)

    void (async () => {
      try {
        const res = await fetch(`/api/member-portal/orders/${orderId}`, { credentials: "same-origin" })
        const data = (await res.json()) as { success?: boolean; order?: OrderDetail; message?: string }
        if (cancelled) return
        if (!data.success || !data.order) {
          setError(t("orderDetailLoadFail"))
          return
        }
        setDetail(data.order)
      } catch {
        if (!cancelled) setError(t("orderDetailLoadFail"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, orderId, t])

  if (!open) return null

  const statusKey = detail
    ? memberPortalOrderStatusLabelKey({
        status: detail.status,
        awaitingPayment: false,
        paymentExpired: false,
      })
    : null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        className={`relative mx-auto w-full ${MP_MAX_WIDTH} overflow-y-auto rounded-t-[1.75rem] border border-stone-200 bg-white px-5 pb-6 pt-4 shadow-2xl`}
        style={{ marginBottom: MP_SHEET_BOTTOM_OFFSET, maxHeight: MP_SHEET_MAX_HEIGHT_ABOVE_NAV }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mp-order-detail-title"
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-stone-200" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="mp-order-detail-title" className={`text-lg font-semibold ${MP_CARD_TEXT_PRIMARY}`}>
              {t("orderDetailTitle")}
            </h3>
            {detail ? (
              <>
                <p className={`mt-1 text-sm font-medium ${MP_CARD_TEXT_PRIMARY}`}>{storeLabel}</p>
                <p className={`text-xs ${MP_CARD_TEXT_MUTED}`}>
                  {detail.orderNo}
                  {detail.pickupHint ? ` · ${detail.pickupHint}` : ""}
                </p>
                <p className={`text-[11px] ${MP_CARD_TEXT_MUTED}`}>
                  {formatDateTime(detail.createdAt, dateLocale)}
                  {statusKey ? ` · ${t(statusKey)}` : ""}
                </p>
              </>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-stone-200 ${MP_CARD_TEXT_SECONDARY}`}
            aria-label={closeLabel}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {loading ? (
          <div className={`flex items-center justify-center gap-2 py-10 text-sm ${MP_CARD_TEXT_MUTED}`}>
            <Loader2 className="h-5 w-5 animate-spin text-amber-500" aria-hidden />
            {t("loginChecking")}
          </div>
        ) : error ? (
          <p className={`rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800`}>{error}</p>
        ) : detail ? (
          <div className="space-y-3">
            <p className={`text-sm font-semibold ${MP_CARD_TEXT_SECONDARY}`}>{t("orderDetailItems")}</p>
            {detail.items.length === 0 ? (
              <p className={`rounded-2xl border border-stone-200 bg-stone-50 px-4 py-6 text-center text-sm ${MP_CARD_TEXT_MUTED}`}>
                {t("orderDetailNoItems")}
              </p>
            ) : (
              <ul className="space-y-2">
                {detail.items.map((line, idx) => (
                  <li
                    key={`${line.menuId}-${line.optionId || ""}-${idx}`}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-stone-200/80 bg-stone-50/90 px-3 py-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <p className={`font-medium ${MP_CARD_TEXT_PRIMARY}`}>
                        {line.name || line.menuId}
                        <span className={`ml-1.5 font-normal tabular-nums ${MP_CARD_TEXT_MUTED}`}>×{line.qty}</span>
                      </p>
                    </div>
                    <p className={`shrink-0 tabular-nums font-medium ${MP_CARD_TEXT_PRIMARY}`}>
                      {formatBaht(line.price * line.qty)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <div className={`flex items-center justify-between border-t border-stone-200 pt-3 text-sm font-semibold ${MP_CARD_TEXT_PRIMARY}`}>
              <span>{t("orderCartTotal")}</span>
              <span className="tabular-nums text-amber-700">{formatBaht(detail.total)}</span>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onClose}
          className={`mt-6 w-full rounded-2xl border border-stone-200 py-3.5 text-sm font-medium ${MP_CARD_TEXT_PRIMARY} hover:bg-stone-50`}
        >
          {closeLabel}
        </button>
      </div>
    </div>
  )
}
