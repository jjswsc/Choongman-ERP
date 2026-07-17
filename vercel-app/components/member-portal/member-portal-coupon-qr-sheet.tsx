"use client"

import * as React from "react"
import QRCode from "qrcode"
import { QrCode, X } from "lucide-react"
import { buildMemberCouponQrPayload } from "@/lib/member-coupon-qr"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import { MP_MAX_WIDTH } from "@/lib/member-portal-design"

type MemberPortalCouponQrSheetProps = {
  open: boolean
  onClose: () => void
  memberNo: string
  couponCode: string
  couponName?: string
  issueId: number
}

export function MemberPortalCouponQrSheet({
  open,
  onClose,
  memberNo,
  couponCode,
  couponName,
  issueId,
}: MemberPortalCouponQrSheetProps) {
  const { t } = useMemberPortalLang()
  const [qrDataUrl, setQrDataUrl] = React.useState("")
  const displayCode = String(couponCode ?? "").trim().toUpperCase()
  const qrPayload = React.useMemo(
    () => buildMemberCouponQrPayload({ memberNo, couponCode: displayCode, issueId }),
    [memberNo, displayCode, issueId]
  )

  React.useEffect(() => {
    if (!open) {
      setQrDataUrl("")
      return
    }
    if (!qrPayload) return
    QRCode.toDataURL(qrPayload, { width: 280, margin: 1, errorCorrectionLevel: "H" })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""))
  }, [open, qrPayload])

  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={t("hideQr")}
        onClick={onClose}
      />
      <div
        className={`relative mx-auto w-full ${MP_MAX_WIDTH} max-w-sm rounded-t-[1.75rem] border border-stone-200/90 bg-white px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 text-stone-900 shadow-2xl sm:rounded-[1.75rem]`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coupon-qr-sheet-title"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-stone-200 sm:hidden" />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full border border-stone-200 bg-white p-2 text-stone-500 shadow-sm transition hover:bg-stone-50 hover:text-stone-800"
          aria-label={t("hideQr")}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2 pr-10">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <QrCode className="h-5 w-5" />
          </div>
          <div>
            <p id="coupon-qr-sheet-title" className="text-sm font-semibold text-stone-900">
              {t("couponQrTitle")}
            </p>
            <p className="text-xs text-stone-500">{t("couponQrHint")}</p>
          </div>
        </div>

        <p className="mt-4 font-mono text-lg font-semibold tracking-wide text-amber-800">{displayCode}</p>
        {couponName && couponName !== displayCode ? (
          <p className="mt-0.5 text-xs text-stone-500">{couponName}</p>
        ) : null}

        <div className="mx-auto mt-4 flex h-[280px] w-[280px] max-w-full items-center justify-center rounded-2xl border border-stone-100 bg-stone-50 p-3">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <p className="text-center text-xs text-stone-400">…</p>
          )}
        </div>

        {displayCode ? (
          <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2.5 text-center">
            <p className="text-[10px] font-medium uppercase tracking-wide text-stone-400">
              {t("couponQrManualCodeLabel")}
            </p>
            <p
              className="mt-0.5 select-all font-mono text-lg font-semibold tracking-wider text-stone-800"
              aria-label={t("couponQrManualCodeLabel")}
            >
              {displayCode}
            </p>
            <p className="mt-1.5 text-[10px] leading-snug text-stone-400">
              {t("couponQrManualEntryHint")}
            </p>
          </div>
        ) : null}

        <p className="mt-3 text-center text-[11px] text-stone-400">{t("scanCouponAtStore")}</p>

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl border border-stone-200 bg-stone-50 py-3 text-sm font-semibold text-stone-800 transition hover:bg-stone-100"
        >
          {t("hideQr")}
        </button>
      </div>
    </div>
  )
}

const couponQrButtonClass = {
  dark: "inline-flex h-8 items-center justify-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 text-xs font-medium leading-none text-amber-100 transition hover:bg-amber-400/20",
  light:
    "inline-flex h-8 items-center justify-center gap-1 rounded-full border border-amber-900/12 bg-gradient-to-r from-amber-500 to-amber-600 px-3 text-xs font-semibold leading-none text-white shadow-[0_4px_14px_rgba(180,120,20,0.28)] transition hover:from-amber-400 hover:to-amber-500",
} as const

export function MemberPortalCouponQrButton({
  memberNo,
  couponCode,
  couponName,
  issueId,
  variant = "dark",
  className,
}: {
  memberNo: string
  couponCode: string
  couponName?: string
  issueId: number
  variant?: keyof typeof couponQrButtonClass
  className?: string
}) {
  const { t } = useMemberPortalLang()
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className ?? couponQrButtonClass[variant]}
      >
        <QrCode className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="whitespace-nowrap">{t("showCouponQr")}</span>
      </button>
      <MemberPortalCouponQrSheet
        open={open}
        onClose={() => setOpen(false)}
        memberNo={memberNo}
        couponCode={couponCode}
        couponName={couponName}
        issueId={issueId}
      />
    </>
  )
}
