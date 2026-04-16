'use client'

import * as React from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLang } from '@/lib/lang-context'
import { useT } from '@/lib/i18n'

type PrinterRow = { name: string; displayName: string; isDefault: boolean }

type PrintConfig = {
  silent?: boolean
  deviceName?: string | null
  receiptDeviceName?: string | null
  kitchen1DeviceName?: string | null
  kitchen2DeviceName?: string | null
  kitchen3DeviceName?: string | null
  kitchenDeviceName?: string | null
}

export function PosHybridPrintDiagnosticsButton() {
  const { lang } = useLang()
  const t = useT(lang)
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [printers, setPrinters] = React.useState<PrinterRow[]>([])
  const [config, setConfig] = React.useState<PrintConfig | null>(null)

  const shell = typeof window !== 'undefined' ? window.cmPosShell : undefined
  const canRun = typeof shell?.listPrinters === 'function' && typeof shell?.getPrintConfig === 'function'

  const load = React.useCallback(async () => {
    if (!shell?.listPrinters || !shell?.getPrintConfig) return
    setLoading(true)
    setError(null)
    try {
      const [plist, cfg] = await Promise.all([shell.listPrinters(), shell.getPrintConfig()])
      setPrinters(Array.isArray(plist) ? plist : [])
      setConfig(cfg && typeof cfg === 'object' ? (cfg as PrintConfig) : null)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [shell])

  React.useEffect(() => {
    if (open) void load()
  }, [open, load])

  if (!canRun) return null

  const title = t('posShellPrintDiagnostics') || '프린터 점검'
  const desc =
    t('posShellPrintDiagnosticsHint') ||
    'Windows에 등록된 프린터와 runtime-config 인쇄 설정을 비교합니다. 이름은 PowerShell Get-Printer 의 Name 과 동일해야 합니다.'

  return (
    <>
      <button
        type="button"
        title={title}
        className="truncate rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        onClick={() => setOpen(true)}
      >
        <span className="inline-flex items-center gap-1">
          <Printer className="h-3.5 w-3.5" />
          {title}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[min(90vh,560px)] overflow-y-auto sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-left text-xs text-muted-foreground">{desc}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
            <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
              {loading ? '…' : t('posShellPrintDiagnosticsRefresh') || '다시 읽기'}
            </Button>
          </div>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          <div className="space-y-3 text-xs">
            <div>
              <p className="mb-1 font-semibold text-foreground">
                {t('posShellPrintDiagnosticsRuntime') || 'runtime-config (무인쇄 대상)'}
              </p>
              <pre className="whitespace-pre-wrap break-all rounded-md bg-muted/80 p-2 font-mono text-[11px] leading-relaxed">
                {config
                  ? JSON.stringify(
                      {
                        silent: config.silent,
                        deviceName: config.deviceName,
                        receiptDeviceName: config.receiptDeviceName,
                        kitchenDeviceName: config.kitchenDeviceName,
                        kitchen1DeviceName: config.kitchen1DeviceName,
                        kitchen2DeviceName: config.kitchen2DeviceName,
                        kitchen3DeviceName: config.kitchen3DeviceName,
                      },
                      null,
                      2
                    )
                  : loading
                    ? '…'
                    : '-'}
              </pre>
            </div>
            <div>
              <p className="mb-1 font-semibold text-foreground">
                {t('posShellPrintDiagnosticsSystem') || '이 PC에 등록된 프린터'}
              </p>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/80 p-2 font-mono text-[11px] leading-relaxed">
                {printers.length
                  ? printers
                      .map(
                        (p) =>
                          `${p.isDefault ? '[기본] ' : ''}${p.name}${p.displayName && p.displayName !== p.name ? ` (${p.displayName})` : ''}`
                      )
                      .join('\n')
                  : loading
                    ? '…'
                    : t('posShellPrintDiagnosticsEmpty') || '(없음)'}
              </pre>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
