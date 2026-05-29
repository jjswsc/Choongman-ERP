'use client'

import * as React from 'react'
import QRCode from 'qrcode'
import { cn } from '@/lib/utils'
import { POS_QR_BRAND, type PosQrDisplayKind } from '@/lib/pos-qr-brand-paths'

type Props = {
  payload: string
  kind: PosQrDisplayKind
  className?: string
  qrClassName?: string
}

export function PosQrGuidelineCard({ payload, kind, className, qrClassName }: Props) {
  const [qrUrl, setQrUrl] = React.useState('')
  const [failed, setFailed] = React.useState(false)

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
      <div className="bg-[#00427A] px-2 py-2">
        <img
          src={POS_QR_BRAND.thaiQrHeader}
          alt="THAI QR PAYMENT"
          className="mx-auto block h-auto w-[92%] max-w-[300px] object-contain"
        />
      </div>
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
        <div className="relative inline-flex">
          <img
            src={qrUrl}
            alt={kind === 'CREDIT_CARD' ? 'Credit Card QR' : 'Thai QR Payment'}
            className={cn('h-[248px] w-[248px] object-contain', qrClassName)}
          />
          <img
            src={POS_QR_BRAND.thaiQrIcon}
            alt=""
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded bg-white p-0.5 object-contain shadow-sm"
          />
        </div>
      </div>
    </div>
  )
}
