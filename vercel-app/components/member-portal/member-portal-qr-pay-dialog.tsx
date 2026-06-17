"use client"

import * as React from "react"
import QRCode from "qrcode"
import { Button } from "@/components/ui/button"
import { formatBaht } from "@/components/member-portal/portal-ui"
import { MemberPortalQrCountdown } from "@/components/member-portal/member-portal-qr-countdown"
import { MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS, MEMBER_PORTAL_QR_STATUS_POLL_MS } from "@/lib/member-portal-prepay-constants"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"


type MemberPortalQrPayDialogProps = {
  open: boolean
  orderId: number
  orderNo?: string
  qrAmount: number
  paymentExpiresAt?: string | null
  onClose: () => void
  onPaid: () => void
  onExpired?: () => void
  t: (key: MemberPortalKey, params?: Record<string, string>) => string
}

export function MemberPortalQrPayDialog({
  open,
  orderId,
  orderNo,
  qrAmount,
  paymentExpiresAt,
  onClose,
  onPaid,
  onExpired,
  t,
}: MemberPortalQrPayDialogProps) {
  const [qrDataUrl, setQrDataUrl] = React.useState("")
  const [partnerTxnId, setPartnerTxnId] = React.useState("")
  const [qrDeadlineMs, setQrDeadlineMs] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState("")

  const handleQrExpired = React.useCallback(() => {
    setError(t("orderCheckoutOrderExpired"))
    onExpired?.()
  }, [onExpired, t])

  React.useEffect(() => {
    if (!open || !orderId) return
    let cancelled = false
    setLoading(true)
    setError("")
    setQrDataUrl("")
    setPartnerTxnId("")
    setQrDeadlineMs(0)

    void (async () => {
      try {
        const res = await fetch(`/api/member-portal/orders/${orderId}/pay/qr`, {
          method: "POST",
          credentials: "same-origin",
        })
        const data = (await res.json()) as {
          success?: boolean
          qrPayload?: string
          partnerTransactionId?: string
          qrAmount?: number
          paymentExpiresAt?: string
          message?: string
        }
        if (cancelled) return
        if (!data.success || !data.qrPayload) {
          setError(
            data.message === "order_expired" ? t("orderCheckoutOrderExpired") : t("orderCheckoutQrFail")
          )
          return
        }
        const url = await QRCode.toDataURL(data.qrPayload, {
          width: 280,
          margin: 1,
          errorCorrectionLevel: "H",
        })
        if (cancelled) return
        setQrDataUrl(url)
        setPartnerTxnId(String(data.partnerTransactionId || ""))
        const deadline = data.paymentExpiresAt
          ? new Date(data.paymentExpiresAt).getTime()
          : Date.now() + MEMBER_PORTAL_PREPAY_QR_EXPIRY_MS
        setQrDeadlineMs(deadline)
      } catch {
        if (!cancelled) setError(t("orderCheckoutQrFail"))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, orderId, t])

  React.useEffect(() => {
    if (!open || !paymentExpiresAt) return
    const ms = new Date(paymentExpiresAt).getTime()
    if (Number.isFinite(ms) && ms > 0) setQrDeadlineMs(ms)
  }, [open, paymentExpiresAt])

  React.useEffect(() => {
    if (!open || !partnerTxnId || !orderId) return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/member-portal/orders/${orderId}/pay/status?partnerTransactionId=${encodeURIComponent(partnerTxnId)}`,
          { credentials: "same-origin" }
        )
        const data = (await res.json()) as { paid?: boolean; message?: string }
        if (!cancelled && data.paid) onPaid()
        else if (!cancelled && data.message === "order_expired") {
          setError(t("orderCheckoutOrderExpired"))
          onExpired?.()
        }
      } catch {
        /* retry */
      }
    }
    void poll()
    const id = window.setInterval(() => void poll(), MEMBER_PORTAL_QR_STATUS_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [open, orderId, onExpired, onPaid, partnerTxnId, t])

  if (!open) return null

  const displayAmount = qrAmount > 0 ? qrAmount : 0

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-[28px] bg-white p-6 text-neutral-900 shadow-2xl sm:rounded-[28px]">
        <p className="text-lg font-bold">{t("orderCheckoutQrTitle")}</p>
        <p className="mt-1 text-sm text-neutral-600">{t("orderCheckoutQrHint")}</p>
        {orderNo ? <p className="mt-2 text-xs text-neutral-400">{orderNo}</p> : null}
        <p className="mt-3 text-center text-2xl font-bold tabular-nums">{formatBaht(displayAmount)}</p>
        {loading ? (
          <p className="mt-8 text-center text-sm text-neutral-500">{t("loginChecking")}</p>
        ) : error ? (
          <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : qrDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrDataUrl} alt="PromptPay QR" className="mx-auto mt-4 w-[280px] rounded-xl" />
        ) : null}
        {!loading && !error && qrDeadlineMs > 0 ? (
          <MemberPortalQrCountdown
            deadlineMs={qrDeadlineMs}
            onExpired={handleQrExpired}
            t={t}
            className="mt-3"
          />
        ) : null}
        {!loading && !error ? (
          <p className="mt-4 text-center text-xs text-neutral-500">{t("orderCheckoutQrWaiting")}</p>
        ) : null}
        <Button type="button" variant="outline" className="mt-5 h-11 w-full rounded-2xl" onClick={onClose}>
          {t("orderBack")}
        </Button>
      </div>
    </div>
  )
}
