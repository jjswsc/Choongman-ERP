"use client"

import * as React from "react"
import QRCode from "qrcode"
import { QrCode, X } from "lucide-react"
import { buildMemberCouponQrPayload } from "@/lib/member-coupon-qr"
import { useMemberPortalLang } from "@/lib/member-portal-lang-context"
import { GlassCard } from "@/components/member-portal/member-portal-premium-ui"

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

  React.useEffect(() => {
    if (!open) {
      setQrDataUrl("")
      return
    }
    const payload = buildMemberCouponQrPayload({ memberNo, couponCode, issueId })
    if (!payload) return
    QRCode.toDataURL(payload, { width: 280, margin: 1, errorCorrectionLevel: "H" })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""))
  }, [open, memberNo, couponCode, issueId])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <GlassCard className="relative w-full max-w-sm px-5 py-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-full p-1.5 text-white/60 transition hover:bg-white/10 hover:text-white"
          aria-label={t("hideQr")}
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <QrCode className="h-5 w-5 text-amber-300" />
          <div>
            <p className="text-sm font-semibold text-white">{t("couponQrTitle")}</p>
            <p className="text-xs text-white/55">{t("couponQrHint")}</p>
          </div>
        </div>
        <p className="mt-4 font-mono text-lg tracking-wide text-amber-200">{couponCode}</p>
        {couponName && couponName !== couponCode ? (
          <p className="mt-0.5 text-xs text-white/60">{couponName}</p>
        ) : null}
        <div className="mx-auto mt-4 flex h-[280px] w-[280px] items-center justify-center rounded-2xl bg-white p-3">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="" className="h-full w-full object-contain" />
          ) : (
            <p className="text-center text-xs text-black/50">…</p>
          )}
        </div>
        <p className="mt-3 text-center text-[11px] text-white/45">{t("scanCouponAtStore")}</p>
      </GlassCard>
    </div>
  )
}

export function MemberPortalCouponQrButton({
  memberNo,
  couponCode,
  couponName,
  issueId,
}: {
  memberNo: string
  couponCode: string
  couponName?: string
  issueId: number
}) {
  const { t } = useMemberPortalLang()
  const [open, setOpen] = React.useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs text-amber-100 transition hover:bg-amber-400/20"
      >
        <QrCode className="h-3.5 w-3.5" />
        {t("showCouponQr")}
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
