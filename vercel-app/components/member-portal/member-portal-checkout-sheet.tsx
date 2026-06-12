"use client"

import * as React from "react"
import QRCode from "qrcode"
import { Button } from "@/components/ui/button"
import { formatBaht } from "@/components/member-portal/portal-ui"
import type { PortalCouponRow } from "@/components/member-portal/portal-ui"
import type { MemberSummary } from "@/lib/members-server"
import { memberPortalT, type MemberPortalKey } from "@/lib/member-portal-i18n"
import type { LangCode } from "@/lib/lang-context"
import { MemberPortalQrCountdown } from "@/components/member-portal/member-portal-qr-countdown"
import {
  clearMemberPortalCheckoutDraft,
  saveMemberPortalCheckoutDraft,
} from "@/lib/member-portal-checkout-draft-storage"
import { MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS } from "@/lib/member-portal-prepay-constants"

type CartLine = {
  menuId: string
  optionId?: string
  code?: string
  name: string
  price: number
  qty: number
}

type CheckoutPreview = {
  prepayEnabled: boolean
  subtotal: number
  packagingFee: number
  vat: number
  couponCode: string
  couponDiscountAmt: number
  totalBeforePoints: number
  pointBalance: number
  maxPointUsable: number
  pointUsed: number
  qrAmount: number
  requiresQr: boolean
  finalTotal: number
}

type MemberPortalCheckoutSheetProps = {
  open: boolean
  lang: LangCode
  t: (key: MemberPortalKey, params?: Record<string, string>) => string
  member: MemberSummary
  storeCode: string
  storeName: string
  pickupAt: string
  cart: CartLine[]
  onClose: () => void
  onPaid: (payload: { orderNo: string; paidWithPointsOnly: boolean }) => void
  onError: (message: string) => void
  onRestoreCart?: () => void
}

const QR_POLL_MS = 3500

export function MemberPortalCheckoutSheet({
  open,
  lang,
  t,
  member,
  storeCode,
  storeName,
  pickupAt,
  cart,
  onClose,
  onPaid,
  onError,
  onRestoreCart,
}: MemberPortalCheckoutSheetProps) {
  const [pointUsed, setPointUsed] = React.useState(0)
  const [selectedCouponCode, setSelectedCouponCode] = React.useState("")
  const [coupons, setCoupons] = React.useState<PortalCouponRow[]>([])
  const [preview, setPreview] = React.useState<CheckoutPreview | null>(null)
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [qrDataUrl, setQrDataUrl] = React.useState("")
  const [qrAmount, setQrAmount] = React.useState(0)
  const [orderId, setOrderId] = React.useState(0)
  const [orderNo, setOrderNo] = React.useState("")
  const [partnerTxnId, setPartnerTxnId] = React.useState("")
  const [phase, setPhase] = React.useState<"checkout" | "qr">("checkout")
  const [qrExpiryMs, setQrExpiryMs] = React.useState(MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS)
  const [qrDeadlineMs, setQrDeadlineMs] = React.useState(0)
  const [qrExpired, setQrExpired] = React.useState(false)

  const cartPayload = React.useMemo(
    () =>
      cart.map(({ menuId, optionId, code, name, price, qty }) => ({
        menuId,
        ...(optionId ? { optionId } : {}),
        ...(code ? { optionCode: String(code) } : {}),
        code,
        name,
        price,
        qty,
      })),
    [cart]
  )

  const loadPreview = React.useCallback(
    async (points: number, couponCode: string) => {
      setPreviewLoading(true)
      try {
        const res = await fetch("/api/member-portal/orders/checkout-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            storeCode,
            items: cartPayload,
            pointUsed: points,
            couponCode,
          }),
        })
        const data = (await res.json()) as {
          success?: boolean
          preview?: CheckoutPreview
          message?: string
        }
        if (!data.success || !data.preview) {
          if (data.message === "coupon_invalid") {
            onError(t("orderCheckoutCouponInvalid"))
          } else {
            onError(t("orderCheckoutPreviewFail"))
          }
          return
        }
        setPreview(data.preview)
        setPointUsed(data.preview.pointUsed)
      } catch {
        onError(t("orderCheckoutPreviewFail"))
      } finally {
        setPreviewLoading(false)
      }
    },
    [cartPayload, onError, storeCode, t]
  )

  React.useEffect(() => {
    if (!open) return
    setPhase("checkout")
    setQrDataUrl("")
    setPartnerTxnId("")
    setOrderId(0)
    setOrderNo("")
    setSelectedCouponCode("")
    void fetch("/api/member-portal/public-config", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { prepayQrExpiryMs?: number }) => {
        const ms = Number(j.prepayQrExpiryMs || 0)
        if (ms > 0) setQrExpiryMs(ms)
      })
      .catch(() => {})
    void fetch("/api/member-portal/me/coupons", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { success?: boolean; rows?: PortalCouponRow[] }) => {
        if (j.success) {
          setCoupons(
            (j.rows || []).filter((c) => String(c.status || "").toLowerCase() === "issued")
          )
        }
      })
      .catch(() => setCoupons([]))
    void loadPreview(0, "")
  }, [loadPreview, open])

  React.useEffect(() => {
    if (!open || phase !== "qr" || !partnerTxnId || !orderId) return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/member-portal/orders/${orderId}/pay/status?partnerTransactionId=${encodeURIComponent(partnerTxnId)}`,
          { credentials: "same-origin" }
        )
        const data = (await res.json()) as { paid?: boolean; message?: string }
        if (!cancelled && data.paid) {
          clearMemberPortalCheckoutDraft()
          onPaid({ orderNo, paidWithPointsOnly: false })
        } else if (!cancelled && data.message === "order_expired") {
          setQrExpired(true)
          onError(t("orderCheckoutOrderExpired"))
        }
      } catch {
        /* retry on next tick */
      }
    }
    void poll()
    const id = window.setInterval(() => void poll(), QR_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [open, phase, partnerTxnId, orderId, orderNo, onClose, onError, onPaid, t])

  const handlePointChange = (next: number) => {
    const v = Math.max(0, Math.trunc(next))
    setPointUsed(v)
    void loadPreview(v, selectedCouponCode)
  }

  const handleCouponChange = (code: string) => {
    setSelectedCouponCode(code)
    void loadPreview(pointUsed, code)
  }

  const handlePay = async () => {
    if (submitting || !preview?.prepayEnabled) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/member-portal/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          storeCode,
          pickupAt,
          items: cartPayload,
          pointUsed,
          couponCode: selectedCouponCode,
        }),
      })
      const data = (await res.json()) as {
        success?: boolean
        message?: string
        orderId?: number
        orderNo?: string
        paid?: boolean
        requiresQr?: boolean
        qrAmount?: number
        paymentExpiresAt?: string
      }
      if (!data.success) {
        if (data.message === "coupon_invalid") {
          onError(t("orderCheckoutCouponInvalid"))
        } else {
          onError(t("orderSubmitFail"))
        }
        return
      }
      const nextOrderNo = String(data.orderNo || "")
      setOrderNo(nextOrderNo)
      setOrderId(Number(data.orderId || 0))

      if (data.paid) {
        clearMemberPortalCheckoutDraft()
        onPaid({ orderNo: nextOrderNo, paidWithPointsOnly: true })
        return
      }

      if (!data.requiresQr || !data.orderId) {
        onError(t("orderSubmitFail"))
        return
      }

      const qrRes = await fetch(`/api/member-portal/orders/${data.orderId}/pay/qr`, {
        method: "POST",
        credentials: "same-origin",
      })
      const qrJson = (await qrRes.json()) as {
        success?: boolean
        qrPayload?: string
        partnerTransactionId?: string
        qrAmount?: number
        message?: string
      }
      if (!qrJson.success || !qrJson.qrPayload) {
        if (qrJson.message === "order_expired") {
          onError(t("orderCheckoutOrderExpired"))
        } else {
          onError(t("orderCheckoutQrFail"))
        }
        return
      }
      const url = await QRCode.toDataURL(qrJson.qrPayload, {
        width: 280,
        margin: 1,
        errorCorrectionLevel: "H",
      })
      setQrDataUrl(url)
      setQrAmount(Number(qrJson.qrAmount || data.qrAmount || preview.qrAmount || 0))
      setPartnerTxnId(String(qrJson.partnerTransactionId || ""))
      const deadline = data.paymentExpiresAt
        ? new Date(data.paymentExpiresAt).getTime()
        : Date.now() + qrExpiryMs
      setQrDeadlineMs(deadline)
      setQrExpired(false)
      saveMemberPortalCheckoutDraft({
        storeCode,
        pickupAt,
        cart,
        pointUsed,
        couponCode: selectedCouponCode,
        orderId: Number(data.orderId || 0),
        qrStartedAtMs: Date.now(),
      })
      setPhase("qr")
    } catch {
      onError(t("orderSubmitFail"))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const pointBalance = preview?.pointBalance ?? member.pointBalance ?? 0

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-white p-6 text-neutral-900 shadow-2xl sm:rounded-[28px]">
        {phase === "checkout" ? (
          <>
            <p className="text-lg font-bold">{t("orderCheckoutTitle")}</p>
            <p className="mt-1 text-sm text-neutral-500">{storeName}</p>
            <p className="text-xs text-neutral-400">{pickupAt.replace("T", " ")}</p>

            <div className="mt-4 space-y-2 rounded-xl bg-neutral-50 px-3 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">{t("orderCartTotal")}</span>
                <span className="tabular-nums font-medium">
                  {formatBaht(preview?.totalBeforePoints ?? 0)}
                </span>
              </div>
              {preview && preview.packagingFee > 0 ? (
                <div className="flex justify-between text-xs text-neutral-500">
                  <span>{t("orderCheckoutPackaging")}</span>
                  <span className="tabular-nums">{formatBaht(preview.packagingFee)}</span>
                </div>
              ) : null}
              {preview && preview.couponDiscountAmt > 0 ? (
                <div className="flex justify-between text-xs text-emerald-700">
                  <span>{t("orderCheckoutCouponDiscount")}</span>
                  <span className="tabular-nums">-{formatBaht(preview.couponDiscountAmt)}</span>
                </div>
              ) : null}
            </div>

            {coupons.length > 0 ? (
              <div className="mt-4 rounded-xl border border-neutral-100 p-3">
                <label className="text-sm font-semibold" htmlFor="mp-checkout-coupon">
                  {t("orderCheckoutCouponLabel")}
                </label>
                <select
                  id="mp-checkout-coupon"
                  value={selectedCouponCode}
                  disabled={previewLoading || submitting}
                  onChange={(e) => handleCouponChange(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="">{t("orderCheckoutCouponNone")}</option>
                  {coupons.map((c) => {
                    const minAmt = Math.max(0, Number(c.minOrderAmt || 0))
                    const subtotal = preview?.subtotal ?? 0
                    const disabled = minAmt > 0 && subtotal + 0.001 < minAmt
                    return (
                      <option key={c.id} value={c.couponCode} disabled={disabled}>
                        {c.couponName || c.couponCode}
                        {minAmt > 0 ? ` (${t("orderCheckoutCouponMinOrder", { amount: String(Math.round(minAmt)) })})` : ""}
                      </option>
                    )
                  })}
                </select>
              </div>
            ) : null}

            <div className="mt-4 rounded-xl border border-neutral-100 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold">{t("orderCheckoutPointsLabel")}</p>
                <p className="text-xs text-neutral-500">
                  {t("orderCheckoutPointsBalance", {
                    balance: String(Math.max(0, Math.trunc(pointBalance))),
                  })}
                </p>
              </div>
              <input
                type="range"
                min={0}
                max={preview?.maxPointUsable ?? 0}
                value={pointUsed}
                disabled={previewLoading || submitting || (preview?.maxPointUsable ?? 0) <= 0}
                onChange={(e) => handlePointChange(Number(e.target.value))}
                className="mt-3 w-full accent-amber-500"
              />
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="tabular-nums text-amber-700">-{formatBaht(pointUsed)}</span>
                <button
                  type="button"
                  className="text-xs font-semibold text-amber-700 underline-offset-2 hover:underline disabled:opacity-40"
                  disabled={previewLoading || (preview?.maxPointUsable ?? 0) <= 0}
                  onClick={() => handlePointChange(preview?.maxPointUsable ?? 0)}
                >
                  {t("orderCheckoutUseAllPoints")}
                </button>
              </div>
            </div>

            <div className="mt-4 flex items-end justify-between border-t border-neutral-100 pt-3">
              <span className="text-sm font-medium">
                {preview?.requiresQr ? t("orderCheckoutQrAmount") : t("orderCheckoutPayWithPoints")}
              </span>
              <span className="text-2xl font-bold tabular-nums">
                {formatBaht(preview?.requiresQr ? preview.qrAmount : 0)}
              </span>
            </div>

            <div className="mt-5 flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1 rounded-2xl"
                disabled={submitting}
                onClick={onClose}
              >
                {t("orderBack")}
              </Button>
              <button
                type="button"
                disabled={submitting || previewLoading || !preview}
                onClick={() => void handlePay()}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-2xl bg-amber-400 text-sm font-semibold text-black transition hover:bg-amber-300 disabled:pointer-events-none disabled:opacity-50"
              >
                {submitting
                  ? t("saving")
                  : preview?.requiresQr
                    ? t("orderCheckoutPayBtn")
                    : t("orderCheckoutPayWithPoints")}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-lg font-bold">{t("orderCheckoutQrTitle")}</p>
            <p className="mt-1 text-sm text-neutral-600">{t("orderCheckoutQrHint")}</p>
            {qrDeadlineMs > 0 ? (
              <MemberPortalQrCountdown
                deadlineMs={qrDeadlineMs}
                t={t}
                className="mt-3"
                onExpired={() => {
                  setQrExpired(true)
                  onError(t("orderCheckoutQrExpired"))
                }}
              />
            ) : null}
            <p className="mt-3 text-center text-2xl font-bold tabular-nums text-neutral-900">
              {formatBaht(qrAmount)}
            </p>
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="PromptPay QR" className="mx-auto mt-4 w-[280px] rounded-xl" />
            ) : null}
            <p className="mt-4 text-center text-xs text-neutral-500">{t("orderCheckoutQrWaiting")}</p>
            {orderNo ? (
              <p className="mt-2 text-center text-xs text-neutral-400">
                {memberPortalT(lang, "orderSubmitSuccess", { orderNo }).replace(/픽업.*|Pay at pickup.*/i, "").trim() ||
                  orderNo}
              </p>
            ) : null}
            {qrExpired ? (
              <Button
                type="button"
                className="mt-4 h-11 w-full rounded-2xl"
                onClick={() => {
                  onRestoreCart?.()
                  onClose()
                }}
              >
                {t("orderCheckoutRestoreCart")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="mt-5 h-11 w-full rounded-2xl"
              onClick={onClose}
            >
              {t("orderBack")}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
