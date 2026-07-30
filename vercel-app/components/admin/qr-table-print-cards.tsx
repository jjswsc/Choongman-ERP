'use client'

import * as React from 'react'
import QRCode from 'qrcode'
import { Download, Printer, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { appAlert } from '@/lib/app-message'
import {
  downloadQrTablePrintCardPng,
  downloadQrTablePrintCardsPdf,
  openQrTablePrintCardsWindow,
  type QrTablePrintCardInput,
} from '@/lib/qr-table-print-card'
import { cn } from '@/lib/utils'

type TokenRow = { tableName: string; token: string; publicUrl?: string }

export function QrTablePrintCardsSection(props: {
  storeLabel: string
  brandLine?: string
  tokens: TokenRow[]
  labels: {
    title: string
    hint: string
    downloadOne: string
    downloadAllPdf: string
    printAll: string
    preview: string
    scanTh: string
    scanEn: string
    popupBlocked: string
  }
}) {
  const { storeLabel, brandLine, tokens, labels } = props
  const [previews, setPreviews] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)

  const cardInputs = React.useMemo(
    (): QrTablePrintCardInput[] =>
      tokens.map((tok) => ({
        storeLabel,
        brandLine,
        tableName: tok.tableName,
        url:
          tok.publicUrl ||
          (typeof window !== 'undefined'
            ? `${window.location.origin}/t/${tok.token}`
            : `/t/${tok.token}`),
      })),
    [tokens, storeLabel, brandLine]
  )

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const next: Record<string, string> = {}
      for (const c of cardInputs.slice(0, 24)) {
        try {
          const url = await QRCode.toDataURL(c.url, {
            width: 160,
            margin: 1,
            errorCorrectionLevel: 'M',
          })
          next[c.tableName] = url
        } catch {
          /* skip */
        }
      }
      if (!cancelled) setPreviews(next)
    })()
    return () => {
      cancelled = true
    }
  }, [cardInputs])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    try {
      await action()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'failed'
      if (msg === 'popup_blocked') {
        await appAlert(labels.popupBlocked)
      } else {
        await appAlert(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!tokens.length) return null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-medium">{labels.title}</h3>
          <p className="text-xs text-muted-foreground">{labels.hint}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(() =>
                downloadQrTablePrintCardsPdf(
                  cardInputs,
                  `table-qr-${storeLabel.replace(/[^\w.-]+/g, '_')}.pdf`
                )
              )
            }
          >
            <FileDown className="mr-1.5 h-4 w-4" />
            {labels.downloadAllPdf}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => void run(() => openQrTablePrintCardsWindow(cardInputs))}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            {labels.printAll}
          </Button>
        </div>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cardInputs.map((card) => (
          <li
            key={card.tableName + card.url}
            className={cn(
              'overflow-hidden rounded-2xl border border-amber-900/10 bg-gradient-to-b from-[#fffdf9] to-[#f3ebe0]',
              'shadow-sm'
            )}
          >
            <div className="border-b border-amber-900/10 bg-amber-800 px-3 py-2 text-center text-xs font-semibold tracking-wide text-amber-50">
              {labels.preview}
            </div>
            <div className="flex flex-col items-center gap-2 px-4 py-4 text-center">
              <p className="text-[10px] font-medium uppercase tracking-wider text-stone-500">
                {storeLabel}
              </p>
              <p className="text-lg font-extrabold tabular-nums text-stone-900">{card.tableName}</p>
              {previews[card.tableName] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previews[card.tableName]}
                  alt=""
                  className="h-28 w-28 rounded-lg bg-white p-1 shadow-sm"
                />
              ) : (
                <div className="h-28 w-28 animate-pulse rounded-lg bg-stone-200/80" />
              )}
              <p className="text-[11px] font-semibold text-stone-800">{labels.scanTh}</p>
              <p className="text-[10px] text-stone-500">{labels.scanEn}</p>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="mt-1 w-full"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    downloadQrTablePrintCardPng(
                      card,
                      `table-qr-${card.tableName.replace(/[^\w.-]+/g, '_')}.png`
                    )
                  )
                }
              >
                <Download className="mr-1.5 h-4 w-4" />
                {labels.downloadOne}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
