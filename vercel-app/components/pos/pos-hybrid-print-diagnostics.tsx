'use client'

import * as React from 'react'
import { AlertTriangle, CheckCircle2, Printer, RotateCw, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useLang } from '@/lib/lang-context'
import { tr, useT } from '@/lib/i18n'

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

type EditablePrintConfig = {
  silent: boolean
  deviceName: string
  receiptDeviceName: string
  kitchenDeviceName: string
  kitchen1DeviceName: string
  kitchen2DeviceName: string
  kitchen3DeviceName: string
}

function normalizeConfigForEdit(cfg: PrintConfig | null): EditablePrintConfig {
  return {
    silent: cfg?.silent !== false,
    deviceName: String(cfg?.deviceName || '').trim(),
    receiptDeviceName: String(cfg?.receiptDeviceName || '').trim(),
    kitchenDeviceName: String(cfg?.kitchenDeviceName || '').trim(),
    kitchen1DeviceName: String(cfg?.kitchen1DeviceName || '').trim(),
    kitchen2DeviceName: String(cfg?.kitchen2DeviceName || '').trim(),
    kitchen3DeviceName: String(cfg?.kitchen3DeviceName || '').trim(),
  }
}

function formatPrintConfigSaveFailure(t: (k: string) => string, reasonRaw: unknown): string {
  const reason = String(reasonRaw || 'save_failed').trim() || 'save_failed'
  if (reason === 'forbidden') return t('posShellPrintDiagnosticsSaveReasonForbidden')
  if (reason === 'invalid_payload') return t('posShellPrintDiagnosticsSaveReasonInvalidPayload')
  if (reason === 'save_failed') return t('posShellPrintDiagnosticsSaveFailed')
  return tr(t, 'posShellPrintDiagnosticsSaveFailedWithReason', { reason })
}

export function PosHybridPrintDiagnosticsButton() {
  const { lang } = useLang()
  const t = useT(lang)
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null)
  const [printers, setPrinters] = React.useState<PrinterRow[]>([])
  const [config, setConfig] = React.useState<PrintConfig | null>(null)
  const [draft, setDraft] = React.useState<EditablePrintConfig>(normalizeConfigForEdit(null))

  const shell = typeof window !== 'undefined' ? window.cmPosShell : undefined
  const canRun = typeof shell?.listPrinters === 'function' && typeof shell?.getPrintConfig === 'function'
  const canSave = typeof shell?.savePrintConfig === 'function'

  const load = React.useCallback(async () => {
    if (!shell?.listPrinters || !shell?.getPrintConfig) return
    setLoading(true)
    setError(null)
    setSaveMessage(null)
    try {
      const [plist, cfg] = await Promise.all([shell.listPrinters(), shell.getPrintConfig()])
      const nextConfig = cfg && typeof cfg === 'object' ? (cfg as PrintConfig) : null
      setPrinters(Array.isArray(plist) ? plist : [])
      setConfig(nextConfig)
      setDraft(normalizeConfigForEdit(nextConfig))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [shell])

  React.useEffect(() => {
    if (open) void load()
  }, [open, load])

  const onChangeField = React.useCallback(
    (key: keyof EditablePrintConfig, value: string | boolean) => {
      setDraft((prev) => {
        if (key === 'silent') return { ...prev, silent: Boolean(value) }
        return { ...prev, [key]: String(value) }
      })
      setSaveMessage(null)
    },
    []
  )

  const onSave = React.useCallback(async () => {
    if (!shell?.savePrintConfig) {
      setError(t('posShellPrintDiagnosticsNoInlineSave'))
      return
    }
    setSaving(true)
    setError(null)
    setSaveMessage(null)
    try {
      const res = await shell.savePrintConfig({
        silent: draft.silent,
        deviceName: draft.deviceName,
        receiptDeviceName: draft.receiptDeviceName,
        kitchenDeviceName: draft.kitchenDeviceName,
        kitchen1DeviceName: draft.kitchen1DeviceName,
        kitchen2DeviceName: draft.kitchen2DeviceName,
        kitchen3DeviceName: draft.kitchen3DeviceName,
      })
      if (!res?.ok) {
        setError(formatPrintConfigSaveFailure(t, res?.reason))
        return
      }
      const nextConfig = res.config && typeof res.config === 'object' ? (res.config as PrintConfig) : null
      setConfig(nextConfig)
      setDraft(normalizeConfigForEdit(nextConfig))
      setSaveMessage(t('commonSaved'))
      const plist = await shell.listPrinters?.()
      if (Array.isArray(plist)) setPrinters(plist)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }, [draft, shell, t])

  const fieldDefs = React.useMemo(
    () =>
      [
        {
          key: 'deviceName' as const,
          label: t('posShellPrintDiagnosticsFieldDeviceName'),
          code: 'deviceName',
          placeholder: t('posShellPrintDiagnosticsPhCounter'),
          hint: t('posShellPrintDiagnosticsHintDeviceName'),
        },
        {
          key: 'receiptDeviceName' as const,
          label: t('posShellPrintDiagnosticsFieldReceipt'),
          code: 'receiptDeviceName',
          placeholder: t('posShellPrintDiagnosticsPhCounter'),
          hint: t('posShellPrintDiagnosticsHintReceipt'),
        },
        {
          key: 'kitchenDeviceName' as const,
          label: t('posShellPrintDiagnosticsFieldKitchenAny'),
          code: 'kitchenDeviceName',
          placeholder: t('posShellPrintDiagnosticsPhKitchen'),
          hint: t('posShellPrintDiagnosticsHintKitchenAny'),
        },
        {
          key: 'kitchen1DeviceName' as const,
          label: t('posShellPrintDiagnosticsFieldKitchen1'),
          code: 'kitchen1DeviceName',
          placeholder: t('posShellPrintDiagnosticsPhKitchen1'),
          hint: t('posShellPrintDiagnosticsHintKitchen1'),
        },
        {
          key: 'kitchen2DeviceName' as const,
          label: t('posShellPrintDiagnosticsFieldKitchen2'),
          code: 'kitchen2DeviceName',
          placeholder: t('posShellPrintDiagnosticsPhKitchen2'),
          hint: t('posShellPrintDiagnosticsHintKitchen2'),
        },
        {
          key: 'kitchen3DeviceName' as const,
          label: t('posShellPrintDiagnosticsFieldKitchen3'),
          code: 'kitchen3DeviceName',
          placeholder: t('posShellPrintDiagnosticsPhKitchen3'),
          hint: t('posShellPrintDiagnosticsHintKitchen3'),
        },
      ] as const,
    [t]
  )

  const registeredPrinterNames = React.useMemo(
    () => new Set(printers.map((p) => String(p.name || '').trim()).filter(Boolean)),
    [printers]
  )

  const namedDraftFields = React.useMemo(
    () => fieldDefs.filter((f) => String(draft[f.key] || '').trim().length > 0),
    [draft, fieldDefs]
  )

  const mismatchFields = React.useMemo(
    () =>
      namedDraftFields.filter((f) => {
        const name = String(draft[f.key] || '').trim()
        return name.length > 0 && !registeredPrinterNames.has(name)
      }),
    [draft, namedDraftFields, registeredPrinterNames]
  )

  const title = t('posShellPrintDiagnostics')
  const desc = t('posShellPrintDiagnosticsHint')

  const defaultPrinter = printers.find((p) => p.isDefault)
  const defaultPrinterLabel = defaultPrinter
    ? `${defaultPrinter.name}${defaultPrinter.displayName && defaultPrinter.displayName !== defaultPrinter.name ? ` (${defaultPrinter.displayName})` : ''}`
    : ''

  const hasExplicitPrintDevices =
    !!config &&
    Boolean(
      (config.deviceName && String(config.deviceName).trim()) ||
        (config.receiptDeviceName && String(config.receiptDeviceName).trim()) ||
        (config.kitchenDeviceName && String(config.kitchenDeviceName).trim()) ||
        (config.kitchen1DeviceName && String(config.kitchen1DeviceName).trim()) ||
        (config.kitchen2DeviceName && String(config.kitchen2DeviceName).trim()) ||
        (config.kitchen3DeviceName && String(config.kitchen3DeviceName).trim())
    )

  const nullHint = t('posShellPrintDiagnosticsRuntimeNullExplain')

  const configRows = React.useMemo(
    () => [
      {
        label: t('posShellPrintDiagnosticsSilentLabel'),
        code: 'silent',
        value: loading
          ? '…'
          : config
            ? config.silent !== false
              ? t('posShellPrintDiagnosticsSilentOn')
              : t('posShellPrintDiagnosticsSilentOff')
            : '-',
      },
      { label: t('posShellPrintDiagnosticsFieldDeviceName'), code: 'deviceName', value: config?.deviceName || '-' },
      { label: t('posShellPrintDiagnosticsFieldReceipt'), code: 'receiptDeviceName', value: config?.receiptDeviceName || '-' },
      { label: t('posShellPrintDiagnosticsFieldKitchenAny'), code: 'kitchenDeviceName', value: config?.kitchenDeviceName || '-' },
      { label: t('posShellPrintDiagnosticsFieldKitchen1'), code: 'kitchen1DeviceName', value: config?.kitchen1DeviceName || '-' },
      { label: t('posShellPrintDiagnosticsFieldKitchen2'), code: 'kitchen2DeviceName', value: config?.kitchen2DeviceName || '-' },
      { label: t('posShellPrintDiagnosticsFieldKitchen3'), code: 'kitchen3DeviceName', value: config?.kitchen3DeviceName || '-' },
    ],
    [t, config, loading]
  )

  const usesOnlyWindowsDefault =
    !loading && Boolean(config) && !hasExplicitPrintDevices && Boolean(defaultPrinterLabel)

  const checklistItems: Array<{ title: string; done: boolean; hint: string }> = [
    {
      title: t('posShellPrintDiagnosticsChecklistName'),
      done: namedDraftFields.length === 0 || mismatchFields.length === 0,
      hint:
        mismatchFields.length > 0
          ? `${mismatchFields
              .slice(0, 2)
              .map((f) => `${f.label}(${String(draft[f.key] || '').trim()})`)
              .join(', ')} ${t('posShellPrintDiagnosticsChecklistNameMismatch')}`
          : t('posShellPrintDiagnosticsChecklistNameOk'),
    },
    {
      title: t('posShellPrintDiagnosticsChecklistDefaultRisk'),
      done: !usesOnlyWindowsDefault,
      hint: usesOnlyWindowsDefault
        ? t('posShellPrintDiagnosticsChecklistDefaultRiskWarn')
        : t('posShellPrintDiagnosticsChecklistDefaultRiskOk'),
    },
    {
      title: t('posShellPrintDiagnosticsChecklistRescan'),
      done: Boolean(saveMessage) && !saving,
      hint:
        saveMessage && !saving
          ? t('posShellPrintDiagnosticsChecklistRescanOk')
          : t('posShellPrintDiagnosticsChecklistRescanTodo'),
    },
  ]

  if (!canRun) return null

  return (
    <>
      <button
        type="button"
        title={title}
        className="truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
        onClick={() => setOpen(true)}
      >
        <span className="inline-flex items-center gap-1">
          <Printer className="h-3.5 w-3.5" />
          {title}
        </span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-left text-sm text-muted-foreground">{desc}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/30 p-3">
            <p className="text-xs text-muted-foreground">
              {t('posShellPrintDiagnosticsGuide')}
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
                <RotateCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {t('posShellPrintDiagnosticsRefresh')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || loading}
                onClick={() => void onSave()}
                title={!canSave ? t('posShellPrintDiagnosticsNoInlineSave') : undefined}
              >
                <Save className="mr-1 h-3.5 w-3.5" />
                {saving ? '…' : t('commonSave')}
              </Button>
            </div>
          </div>

          {error ? (
            <p className="inline-flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
          {saveMessage ? (
            <p className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <span>{saveMessage}</span>
            </p>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-border/80 bg-background p-3">
              <p className="text-sm font-semibold text-foreground">
                {t('posShellPrintDiagnosticsRuntimeApplied')}
              </p>
              <div className="space-y-2">
                {configRows.map((row) => (
                  <div
                    key={row.code}
                    className="grid grid-cols-[130px_1fr] items-start gap-2 rounded-lg border border-border/60 bg-muted/30 px-2.5 py-2 text-xs"
                  >
                    <p className="font-medium text-foreground">{row.label}</p>
                    <div className="space-y-0.5">
                      <p className="font-mono text-[11px] text-muted-foreground">{row.code}</p>
                      <p className="break-all font-mono text-foreground">{loading ? '…' : row.value || '-'}</p>
                    </div>
                  </div>
                ))}
              </div>
              {!loading && config && !hasExplicitPrintDevices ? (
                <div className="space-y-1 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
                  <p>{nullHint}</p>
                  {defaultPrinterLabel ? (
                      <p className="font-medium">
                      {t('posShellPrintDiagnosticsWindowsDefaultNow')}{' '}
                      <span className="font-mono">{defaultPrinterLabel}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="space-y-3 rounded-xl border border-border/80 bg-background p-3">
              <p className="text-sm font-semibold text-foreground">
                {t('posShellPrintDiagnosticsSystem')}
              </p>
              <div className="max-h-64 space-y-1 overflow-auto rounded-lg border border-border/60 bg-muted/30 p-2 text-xs">
                {printers.length ? (
                  printers.map((p) => {
                    const label = `${p.name}${p.displayName && p.displayName !== p.name ? ` (${p.displayName})` : ''}`
                    return (
                      <div
                        key={`${p.name}-${p.displayName}`}
                        className="rounded-md border border-border/50 bg-background px-2 py-1.5 font-mono text-[11px] text-foreground"
                      >
                        {p.isDefault ? `${t('posShellPrintDiagnosticsPrinterDefaultBadge')} ${label}` : label}
                      </div>
                    )
                  })
                ) : (
                  <p className="px-1 py-2 text-muted-foreground">
                    {loading ? '…' : t('posShellPrintDiagnosticsEmpty')}
                  </p>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('posShellPrintDiagnosticsMatchHint')}
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border/80 bg-background p-3">
            <p className="text-sm font-semibold text-foreground">
              {t('posShellPrintDiagnosticsChecklistTitle')}
            </p>
            <div className="space-y-2">
              {checklistItems.map((item, idx) => (
                <div
                  key={item.title}
                  className={`rounded-lg border px-3 py-2 ${
                    item.done
                      ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                      : 'border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20'
                  }`}
                >
                  <p className="inline-flex items-center gap-2 text-xs font-semibold">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">
                      {idx + 1}
                    </span>
                    {item.done ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                    <span className="text-foreground">{item.title}</span>
                  </p>
                  <p className="mt-1 pl-7 text-[11px] leading-relaxed text-muted-foreground">{item.hint}</p>
                </div>
              ))}
            </div>
          </div>

          {canSave ? (
            <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-3">
              <p className="text-sm font-semibold text-foreground">
                {t('posShellPrintDiagnosticsEditInline')}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('posShellPrintDiagnosticsEditInlineHint')}
              </p>
              <label className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.silent}
                  onChange={(e) => onChangeField('silent', e.currentTarget.checked)}
                />
                <span>{t('posShellPrintDiagnosticsSilentLabel')}</span>
              </label>
              <datalist id="cm-pos-printer-name-options">
                {printers.map((p) => (
                  <option key={p.name} value={p.name} />
                ))}
              </datalist>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {fieldDefs.map((f) => (
                  <label key={f.key} className="space-y-1 rounded-lg border border-border/70 bg-background p-2.5">
                    <span className="block text-xs font-medium text-foreground">{f.label}</span>
                    <span className="block font-mono text-[11px] text-muted-foreground">{f.code}</span>
                    <input
                      list="cm-pos-printer-name-options"
                      value={draft[f.key] as string}
                      onChange={(e) => onChangeField(f.key, e.currentTarget.value)}
                      placeholder={f.placeholder}
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                    />
                    <span className="block text-[11px] leading-relaxed text-muted-foreground">{f.hint}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 p-2 text-xs leading-relaxed text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100">
              {t('posShellPrintDiagnosticsNoInlineSave')}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
