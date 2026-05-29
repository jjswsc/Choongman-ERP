'use client'

import * as React from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'
import { POS_QR_BRAND, type PosQrDisplayKind } from '@/lib/pos-qr-brand-paths'

/** `thai-qr-payment` renderCard header crop (viewBox 88 75 750 210 on Logo-01). */
const THAI_QR_HEADER_CROP = {
  imageWidth: 913,
  imageHeight: 376,
  x: 88,
  y: 75,
  width: 750,
  height: 210,
} as const

/** Center logo ≈ 16% of QR module area (same ratio as `renderCard`). */
const QR_DISPLAY_PX = 248
const CENTER_LOGO_RATIO = 0.16

type Props = {
  payload: string
  kind: PosQrDisplayKind
  className?: string
  qrClassName?: string
}

function ThaiQrHeaderBand({ className }: { className?: string }) {
  const { imageWidth, imageHeight, x, y, width, height } = THAI_QR_HEADER_CROP
  const bgWidthPct = (imageWidth / width) * 100
  const bgHeightPct = (imageHeight / height) * 100
  const posXPct = (x / (imageWidth - width)) * 100
  const posYPct = (y / (imageHeight - height)) * 100

  return (
    <div
      className={cn('w-full overflow-hidden bg-[#00427A]', className)}
      style={{ aspectRatio: `${width} / ${height}` }}
      role="img"
      aria-label="THAI QR PAYMENT"
    >
      <div
        className="h-full w-full bg-no-repeat"
        style={{
          backgroundImage: `url(${POS_QR_BRAND.thaiQrHeader})`,
          backgroundSize: `${bgWidthPct}% ${bgHeightPct}%`,
          backgroundPosition: `${posXPct}% ${posYPct}%`,
        }}
      />
    </div>
  )
}

export function PosQrGuidelineCard({ payload, kind, className, qrClassName }: Props) {
  const [qrUrl, setQrUrl] = React.useState('')
  const [failed, setFailed] = React.useState(false)
  const centerLogoPx = Math.round(QR_DISPLAY_PX * CENTER_LOGO_RATIO)

  React.useEffect(() => {
    const raw = String(payload || '').trim()
    if (!raw.startsWith('000201')) {
      setQrUrl('')
      setFailed(false)
      return
    }
    let cancelled = false
    setFailed(false)
    QRCode.toDataURL(raw, { width: 520, margin: 1, errorCorrectionLevel: 'H' })
      .then((url) => {
        if (!cancelled) {
          setQrUrl(url)
          setFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrUrl('')
          setFailed(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [payload])

  const raw = String(payload || '').trim()
  if (!raw.startsWith('000201')) return null

  if (failed || (kind === 'CREDIT_CARD' && !qrUrl)) {
    return (
      <div
        className={cn(
          'flex min-h-[280px] flex-col items-center justify-center gap-2 p-4 text-center text-xs text-rose-700',
          className
        )}
      >
        <span>QR render failed.</span>
        <span className="text-muted-foreground">
          {kind === 'CREDIT_CARD'
            ? 'Credit Card guideline card was not generated. Please retry Generate QR.'
            : 'Thai QR guideline card was not generated. Please retry Generate QR.'}
        </span>
      </div>
    )
  }

  if (!qrUrl) {
    return (
      <div className={cn('flex min-h-[280px] items-center justify-center p-4 text-xs text-muted-foreground', className)}>
        …
      </div>
    )
  }

  return (
    <div className={cn('overflow-hidden rounded-md border bg-white', className)}>
      <ThaiQrHeaderBand />
      <div className="border-t border-[#d8e1ef] bg-white px-3 py-2.5">
        {kind === 'CREDIT_CARD' ? (
          <div className="mx-auto flex w-full max-w-[320px] items-center justify-center gap-2 sm:gap-3">
            <img src={POS_QR_BRAND.visa} alt="Visa" className="h-7 max-h-8 flex-1 object-contain" />
            <img src={POS_QR_BRAND.mastercard} alt="Mastercard" className="h-8 max-h-9 flex-1 object-contain" />
            <img src={POS_QR_BRAND.unionpay} alt="UnionPay" className="h-7 max-h-8 flex-1 object-contain" />
          </div>
        ) : (
          <img
            src={POS_QR_BRAND.promptpay}
            alt="PromptPay"
            className="mx-auto block h-auto w-[72%] max-w-[270px] object-contain"
          />
        )}
      </div>
      <div className="flex items-center justify-center bg-white px-3 pb-4 pt-2">
        <div className="relative inline-flex" style={{ width: QR_DISPLAY_PX, height: QR_DISPLAY_PX }}>
          <img
            src={qrUrl}
            alt={kind === 'CREDIT_CARD' ? 'Credit Card QR' : 'Thai QR Payment'}
            className={cn('h-full w-full object-contain', qrClassName)}
          />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded bg-white"
            style={{
              width: centerLogoPx + 8,
              height: centerLogoPx + 8,
            }}
            aria-hidden
          >
            <img
              src={POS_QR_BRAND.thaiQrCenterLogo}
              alt=""
              className="object-contain"
              style={{ width: centerLogoPx, height: centerLogoPx }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
