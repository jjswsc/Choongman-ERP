'use client'

import * as React from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'
import { POS_QR_BRAND, type PosQrDisplayKind } from '@/lib/pos-qr-brand-paths'

/**
 * BOT / KBank guideline card — fixed card width; header full-width blue band.
 * PromptPay / card brands / QR use guideline ratios (not stretched to column).
 */
const GUIDELINE_CARD_WIDTH_PX = 280
const QR_WIDTH_RATIO = 0.82
const PROMPTPAY_WIDTH_RATIO = 0.28
const CARD_BRAND_ROW_WIDTH_RATIO = 0.72
const HEADER_BAND_HEIGHT_RATIO = 0.22
const CENTER_LOGO_RATIO = 0.14

type Props = {
  payload: string
  kind: PosQrDisplayKind
  className?: string
  /** Override QR module size (e.g. customer display `h-[280px] w-[280px]`). */
  qrClassName?: string
}

function ThaiQrHeaderBand({ bandHeightPx }: { bandHeightPx: number }) {
  return (
    <div
      className="flex w-full shrink-0 items-center justify-center overflow-hidden bg-[#00427A]"
      style={{ height: bandHeightPx }}
      role="img"
      aria-label="THAI QR PAYMENT"
    >
      <img
        src={POS_QR_BRAND.thaiQrHeader}
        alt=""
        aria-hidden
        className="h-full w-auto max-w-full object-contain object-center"
        draggable={false}
      />
    </div>
  )
}

function parseQrModulePx(qrClassName?: string): number | null {
  const raw = String(qrClassName || '').trim()
  const bracket = raw.match(/\bw-\[(\d+(?:\.\d+)?)px\]/i) || raw.match(/\bh-\[(\d+(?:\.\d+)?)px\]/i)
  if (!bracket) return null
  const n = Number(bracket[1])
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n)
}

function resolveCardLayout(qrClassName?: string) {
  const qrOverride = parseQrModulePx(qrClassName)
  const cardWidthPx = qrOverride
    ? Math.round(qrOverride / QR_WIDTH_RATIO)
    : GUIDELINE_CARD_WIDTH_PX
  const qrDisplayPx = qrOverride ?? Math.round(cardWidthPx * QR_WIDTH_RATIO)
  const promptPayWidthPx = Math.round(cardWidthPx * PROMPTPAY_WIDTH_RATIO)
  const cardBrandRowWidthPx = Math.round(cardWidthPx * CARD_BRAND_ROW_WIDTH_RATIO)
  const headerHeightPx = Math.max(48, Math.round(cardWidthPx * HEADER_BAND_HEIGHT_RATIO))
  const centerLogoPx = Math.round(qrDisplayPx * CENTER_LOGO_RATIO)
  return {
    cardWidthPx,
    qrDisplayPx,
    promptPayWidthPx,
    cardBrandRowWidthPx,
    headerHeightPx,
    centerLogoPx,
  }
}

export function PosQrGuidelineCard({ payload, kind, className, qrClassName }: Props) {
  const [qrUrl, setQrUrl] = React.useState('')
  const [failed, setFailed] = React.useState(false)
  const layout = React.useMemo(() => resolveCardLayout(qrClassName), [qrClassName])

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

  const {
    cardWidthPx,
    qrDisplayPx,
    promptPayWidthPx,
    cardBrandRowWidthPx,
    headerHeightPx,
    centerLogoPx,
  } = layout

  return (
    <div
      className={cn('mx-auto overflow-hidden rounded-md border bg-white', className)}
      style={{ width: cardWidthPx, maxWidth: '100%' }}
    >
      <ThaiQrHeaderBand bandHeightPx={headerHeightPx} />
      <div className="bg-white px-2 py-1">
        {kind === 'CREDIT_CARD' ? (
          <div
            className="mx-auto flex items-center justify-center gap-1.5"
            style={{ width: cardBrandRowWidthPx, maxWidth: '100%' }}
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
            style={{ width: promptPayWidthPx, maxWidth: '100%' }}
          />
        )}
      </div>
      <div className="flex items-center justify-center bg-white px-2 pb-3 pt-0.5">
        <div
          className="relative shrink-0"
          style={{ width: qrDisplayPx, height: qrDisplayPx, maxWidth: '100%' }}
        >
          <img
            src={qrUrl}
            alt={kind === 'CREDIT_CARD' ? 'Credit Card QR' : 'Thai QR Payment'}
            className="h-full w-full object-contain"
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
