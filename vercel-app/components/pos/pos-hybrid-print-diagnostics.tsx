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
      setError(
        t('posShellPrintDiagnosticsNoInlineSave') ||
          '현재 설치된 POS 셸은 점검창 저장 기능이 없는 버전입니다. 앱 업데이트 후 다시 시도하세요.'
      )
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
        setError(res?.reason || 'save_failed')
        return
      }
      const nextConfig = res.config && typeof res.config === 'object' ? (res.config as PrintConfig) : null
      setConfig(nextConfig)
      setDraft(normalizeConfigForEdit(nextConfig))
      setSaveMessage(t('commonSaved') || '저장 완료')
      const plist = await shell.listPrinters?.()
      if (Array.isArray(plist)) setPrinters(plist)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }, [draft, shell, t])

  const fieldDefs: Array<{
    key: keyof EditablePrintConfig
    label: string
    code: string
    placeholder: string
    hint: string
  }> = [
    {
      key: 'deviceName',
      label: '공통 기본 프린터',
      code: 'deviceName',
      placeholder: '예: Counter',
      hint: '영수증/주방 개별 지정이 없을 때 공통으로 사용됩니다.',
    },
    {
      key: 'receiptDeviceName',
      label: '영수증 프린터',
      code: 'receiptDeviceName',
      placeholder: '예: Counter',
      hint: '결제 영수증에 우선 적용됩니다.',
    },
    {
      key: 'kitchenDeviceName',
      label: '주방 공통 프린터',
      code: 'kitchenDeviceName',
      placeholder: '예: Kitchen',
      hint: '주방1/2/3 개별 지정이 없을 때 사용됩니다.',
    },
    {
      key: 'kitchen1DeviceName',
      label: '주방1 프린터',
      code: 'kitchen1DeviceName',
      placeholder: '예: kitchen1',
      hint: '주방 라우팅에서 1번으로 분기된 주문서에 적용됩니다.',
    },
    {
      key: 'kitchen2DeviceName',
      label: '주방2 프린터',
      code: 'kitchen2DeviceName',
      placeholder: '예: kitchen2',
      hint: '주방 라우팅에서 2번으로 분기된 주문서에 적용됩니다.',
    },
    {
      key: 'kitchen3DeviceName',
      label: '주방3 프린터',
      code: 'kitchen3DeviceName',
      placeholder: '예: kitchen3',
      hint: '주방 라우팅에서 3번으로 분기된 주문서에 적용됩니다.',
    },
  ]

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

  const title = t('posShellPrintDiagnostics') || '프린터 점검'
  const desc =
    t('posShellPrintDiagnosticsHint') ||
    'Windows에 등록된 프린터 목록과 현재 인쇄 설정을 비교해 점검합니다. 프린터 이름은 PowerShell Get-Printer의 Name과 정확히 같아야 합니다.'

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

  const nullHint =
    t('posShellPrintDiagnosticsRuntimeNullExplain') ||
    'deviceName·receiptDeviceName·kitchen* 가 모두 비어 있으면(null) 무인쇄용 프린터를 아직 지정하지 않은 상태입니다. 이 경우 영수증·주방 모두 Windows 기본 프린터로 나가는 경우가 많습니다. 서로 다른 기기로 나누려면 아래 목록의 이름을 그대로 복사해 runtime-config.json의 print 섹션에 넣으세요.'

  const configRows = [
    {
      label: '무인쇄 우선 모드',
      code: 'silent',
      value: config ? (config.silent !== false ? '사용' : '미사용') : '-',
    },
    { label: '공통 기본 프린터', code: 'deviceName', value: config?.deviceName || '-' },
    { label: '영수증 프린터', code: 'receiptDeviceName', value: config?.receiptDeviceName || '-' },
    { label: '주방 공통 프린터', code: 'kitchenDeviceName', value: config?.kitchenDeviceName || '-' },
    { label: '주방1 프린터', code: 'kitchen1DeviceName', value: config?.kitchen1DeviceName || '-' },
    { label: '주방2 프린터', code: 'kitchen2DeviceName', value: config?.kitchen2DeviceName || '-' },
    { label: '주방3 프린터', code: 'kitchen3DeviceName', value: config?.kitchen3DeviceName || '-' },
  ]

  const usesOnlyWindowsDefault =
    !loading && Boolean(config) && !hasExplicitPrintDevices && Boolean(defaultPrinterLabel)

  const checklistItems: Array<{ title: string; done: boolean; hint: string }> = [
    {
      title: t('posShellPrintDiagnosticsChecklistName') || '프린터 이름 일치 확인',
      done: namedDraftFields.length === 0 || mismatchFields.length === 0,
      hint:
        mismatchFields.length > 0
          ? `${mismatchFields
              .slice(0, 2)
              .map((f) => `${f.label}(${String(draft[f.key] || '').trim()})`)
              .join(', ')} ${t('posShellPrintDiagnosticsChecklistNameMismatch') || '값이 목록과 다릅니다.'}`
          : t('posShellPrintDiagnosticsChecklistNameOk') ||
            '입력된 프린터명이 현재 Windows 등록 목록과 일치합니다.',
    },
    {
      title: t('posShellPrintDiagnosticsChecklistDefaultRisk') || '기본 프린터 의존 위험 점검',
      done: !usesOnlyWindowsDefault,
      hint: usesOnlyWindowsDefault
        ? t('posShellPrintDiagnosticsChecklistDefaultRiskWarn') ||
          '현재는 Windows 기본 프린터만 사용될 가능성이 큽니다. 영수증/주방 분리를 위해 각 항목에 프린터를 지정하세요.'
        : t('posShellPrintDiagnosticsChecklistDefaultRiskOk') ||
          '개별 프린터가 지정되어 기본 프린터 의존 위험이 낮습니다.',
    },
    {
      title: t('posShellPrintDiagnosticsChecklistRescan') || '저장 후 재확인',
      done: Boolean(saveMessage) && !saving,
      hint:
        saveMessage && !saving
          ? t('posShellPrintDiagnosticsChecklistRescanOk') ||
            '저장이 완료되었습니다. 다시 읽기로 최종 반영 상태를 확인하세요.'
          : t('posShellPrintDiagnosticsChecklistRescanTodo') ||
            '값을 저장한 뒤 `다시 읽기`를 눌러 실제 반영값을 꼭 확인하세요.',
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
              {t('posShellPrintDiagnosticsGuide') || '점검 순서: 목록 새로고침 → 프린터명 확인 → 필요 시 저장'}
            </p>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void load()}>
                <RotateCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {t('posShellPrintDiagnosticsRefresh') || '다시 읽기'}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saving || loading}
                onClick={() => void onSave()}
                title={!canSave ? (t('posShellPrintDiagnosticsNoInlineSave') || '현재 POS 셸 버전은 점검창 저장을 지원하지 않습니다.') : undefined}
              >
                <Save className="mr-1 h-3.5 w-3.5" />
                {saving ? '…' : t('commonSave') || '저장'}
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
                {t('posShellPrintDiagnosticsRuntime') || '현재 적용 중인 인쇄 설정'}
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
                      {t('posShellPrintDiagnosticsWindowsDefaultNow') || '현재 Windows 기본 프린터:'}{' '}
                      <span className="font-mono">{defaultPrinterLabel}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="space-y-3 rounded-xl border border-border/80 bg-background p-3">
              <p className="text-sm font-semibold text-foreground">
                {t('posShellPrintDiagnosticsSystem') || '이 PC에 등록된 프린터'}
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
                        {p.isDefault ? `[기본] ${label}` : label}
                      </div>
                    )
                  })
                ) : (
                  <p className="px-1 py-2 text-muted-foreground">
                    {loading ? '…' : t('posShellPrintDiagnosticsEmpty') || '(없음)'}
                  </p>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {t('posShellPrintDiagnosticsMatchHint') || '입력값은 위 프린터 이름과 한 글자까지 동일해야 정상 동작합니다.'}
              </p>
            </div>
          </div>

          <div className="space-y-2 rounded-xl border border-border/80 bg-background p-3">
            <p className="text-sm font-semibold text-foreground">
              {t('posShellPrintDiagnosticsChecklistTitle') || '문제 진단 체크리스트'}
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
                {t('posShellPrintDiagnosticsEditInline') || '점검창에서 바로 수정/저장'}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('posShellPrintDiagnosticsEditInlineHint') ||
                  '아래 값을 저장하면 이 POS 앱에서 읽는 runtime-config.json(userData)의 print 설정이 즉시 갱신됩니다.'}
              </p>
              <label className="flex items-center gap-2 rounded-lg border border-border/70 bg-background px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  checked={draft.silent}
                  onChange={(e) => onChangeField('silent', e.currentTarget.checked)}
                />
                <span>무인쇄 우선 사용 (`silent`)</span>
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
              {t('posShellPrintDiagnosticsNoInlineSave') ||
                '현재 설치된 POS 셸은 점검창 저장 기능이 없는 버전입니다. 앱 업데이트 후 점검창에서 바로 저장할 수 있습니다.'}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
