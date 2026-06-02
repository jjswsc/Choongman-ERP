'use client'

import * as React from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'
import { POS_QR_BRAND, type PosQrDisplayKind } from '@/lib/pos-qr-brand-paths'

/**
 * BOT / KBank guideline card proportions (reference slip layout).
 * - Header band: full card width
 * - PromptPay mark: ~28% card width
 * - QR modules: ~82% card width
 * - Center logo: ~14% of QR module area
 */
const GUIDELINE_CARD_WIDTH_PX = 280
const QR_WIDTH_RATIO = 0.82
const PROMPTPAY_WIDTH_RATIO = 0.28
const CARD_BRAND_ROW_WIDTH_RATIO = 0.72
/** PromptPay screen header height (photo 2) — shared by both QR kinds. */
const HEADER_BAND_HEIGHT_RATIO = 0.22
const CENTER_LOGO_RATIO = 0.14

const QR_DISPLAY_PX = Math.round(GUIDELINE_CARD_WIDTH_PX * QR_WIDTH_RATIO)
const PROMPTPAY_WIDTH_PX = Math.round(GUIDELINE_CARD_WIDTH_PX * PROMPTPAY_WIDTH_RATIO)
const CARD_BRAND_ROW_WIDTH_PX = Math.round(GUIDELINE_CARD_WIDTH_PX * CARD_BRAND_ROW_WIDTH_RATIO)
const HEADER_BAND_HEIGHT_PX = Math.round(GUIDELINE_CARD_WIDTH_PX * HEADER_BAND_HEIGHT_RATIO)

/** Logo-01 crop: blue header band only (matches `thai-qr-payment` renderCard). */
const THAI_QR_HEADER_CROP = {
  imageWidth: 913,
  imageHeight: 376,
  x: 88,
  y: 75,
  width: 750,
  height: 210,
} as const

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
      style={{ height: HEADER_BAND_HEIGHT_PX }}
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
    <div
      className={cn('mx-auto overflow-hidden rounded-md border bg-white', className)}
      style={{ width: GUIDELINE_CARD_WIDTH_PX, maxWidth: '100%' }}
    >
      <ThaiQrHeaderBand />
      <div className="bg-white px-2 py-2">
        {kind === 'CREDIT_CARD' ? (
          <div
            className="mx-auto flex items-center justify-center gap-1.5"
            style={{ width: CARD_BRAND_ROW_WIDTH_PX }}
          >
            <img src={POS_QR_BRAND.visa} alt="Visa" className="h-5 max-h-6 flex-1 object-contain" />
            <img src={POS_QR_BRAND.mastercard} alt="Mastercard" className="h-6 max-h-7 flex-1 object-contain" />
            <img src={POS_QR_BRAND.unionpay} alt="UnionPay" className="h-5 max-h-6 flex-1 object-contain" />
          </div>
        ) : (
          <img
            src={POS_QR_BRAND.promptpay}
            alt="PromptPay"
            className="mx-auto block h-auto object-contain"
            style={{ width: PROMPTPAY_WIDTH_PX, maxWidth: '100%' }}
          />
        )}
      </div>
      <div className="flex items-center justify-center bg-white px-2 pb-3 pt-1">
        <div className="relative inline-flex" style={{ width: QR_DISPLAY_PX, height: QR_DISPLAY_PX }}>
          <img
            src={qrUrl}
            alt={kind === 'CREDIT_CARD' ? 'Credit Card QR' : 'Thai QR Payment'}
            className={cn('h-full w-full object-contain', qrClassName)}
          />
          <img
            src={POS_QR_BRAND.thaiQrCenterLogo}
            alt=""
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
            style={{ width: centerLogoPx, height: centerLogoPx }}
          />
        </div>
      </div>
    </div>
  )
}
