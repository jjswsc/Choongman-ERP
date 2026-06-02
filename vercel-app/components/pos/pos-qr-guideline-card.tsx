'use client'

import * as React from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'
import { POS_QR_BRAND, type PosQrDisplayKind } from '@/lib/pos-qr-brand-paths'

/**
 * BOT / KBank guideline card — one column width (QR module width).
 * Header blue band, brand row, and QR share the same horizontal span.
 */
const DEFAULT_QR_SIZE_PX = 230
const HEADER_BAND_HEIGHT_RATIO = 0.24
const CENTER_LOGO_RATIO = 0.14

type Props = {
  payload: string
  kind: PosQrDisplayKind
  className?: string
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
      {/* Full-width blue only; logo/text keep aspect ratio (no horizontal stretch). */}
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

function resolveQrBoxClass(qrClassName?: string): string {
  if (qrClassName?.trim()) return qrClassName.trim()
  return `h-[${DEFAULT_QR_SIZE_PX}px] w-[${DEFAULT_QR_SIZE_PX}px]`
}

function parseQrWidthPx(qrClassName?: string): number {
  const raw = String(qrClassName || '')
  const bracket = raw.match(/\bw-\[(\d+(?:\.\d+)?)px\]/i)
  if (bracket) {
    const n = Number(bracket[1])
    if (Number.isFinite(n) && n > 0) return Math.round(n)
  }
  return DEFAULT_QR_SIZE_PX
}

export function PosQrGuidelineCard({ payload, kind, className, qrClassName }: Props) {
  const [qrUrl, setQrUrl] = React.useState('')
  const [failed, setFailed] = React.useState(false)
  const qrBoxClass = resolveQrBoxClass(qrClassName)
  const qrWidthPx = parseQrWidthPx(qrClassName)

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

  const headerHeightPx = Math.max(48, Math.round(qrWidthPx * HEADER_BAND_HEIGHT_RATIO))
  const centerLogoPx = Math.round(qrWidthPx * CENTER_LOGO_RATIO)

  return (
    <div className={cn('mx-auto overflow-hidden rounded-md border bg-white', className)}>
      {/* QR 박스 너비 = 컬럼 너비 → 헤더 파란 띠도 동일 너비 */}
      <div className="inline-flex w-fit max-w-full flex-col items-stretch">
        <ThaiQrHeaderBand bandHeightPx={headerHeightPx} />
        <div className="bg-white py-2">
          {kind === 'CREDIT_CARD' ? (
            <div className="mx-auto flex w-[88%] max-w-full items-center justify-center gap-1.5">
              <img src={POS_QR_BRAND.visa} alt="Visa" className="h-5 max-h-6 flex-1 object-contain" />
              <img src={POS_QR_BRAND.mastercard} alt="Mastercard" className="h-6 max-h-7 flex-1 object-contain" />
              <img src={POS_QR_BRAND.unionpay} alt="UnionPay" className="h-5 max-h-6 flex-1 object-contain" />
            </div>
          ) : (
            <img
              src={POS_QR_BRAND.promptpay}
              alt="PromptPay"
              className="mx-auto block h-auto w-[72%] max-w-full object-contain"
            />
          )}
        </div>
        <div className="relative shrink-0 bg-white pb-3">
          <div className={cn('relative', qrBoxClass)}>
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
    </div>
  )
}
