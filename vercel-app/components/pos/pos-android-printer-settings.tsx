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
import {
  ANDROID_THERMAL_DEFAULT_TCP_PORT,
  ANDROID_THERMAL_SLOTS,
  defaultAndroidThermalConfig,
  describeAndroidThermalTarget,
  hasAnyAndroidThermalTarget,
  normalizeAndroidThermalTarget,
  type AndroidThermalConfig,
  type AndroidThermalSlot,
  type AndroidThermalTarget,
} from '@/lib/android-thermal-printer-config'
import {
  isAndroidThermalPluginAvailable,
  listAndroidBluetoothPrinters,
  listAndroidUsbPrinters,
  loadAndroidThermalConfig,
  printHtmlViaAndroidThermal,
  requestAndroidUsbPermission,
  saveAndroidThermalConfig,
} from '@/lib/android-thermal-printer'

type TargetType = 'none' | AndroidThermalTarget['type']

/** 슬롯별 편집 상태 — 타입을 바꿔도 LAN IP 등 입력값이 사라지지 않게 따로 보관 */
type SlotDraft = {
  type: TargetType
  host: string
  port: string
  btAddress: string
  btName: string
  usbKey: string
  usbName: string
}

type BtDevice = { address: string; name: string }
type UsbDevice = { vendorId: number; productId: number; name: string; hasPermission: boolean }

function slotLabel(t: (key: string) => string, slot: AndroidThermalSlot): string {
  switch (slot) {
    case 'receipt':
      return t('posAndroidPrintSlotReceipt')
    case 'kitchen1':
      return t('posAndroidPrintSlotKitchen1')
    case 'kitchen2':
      return t('posAndroidPrintSlotKitchen2')
    case 'kitchen3':
      return t('posAndroidPrintSlotKitchen3')
    default:
      return t('posAndroidPrintSlotKitchenAny')
  }
}

const usbKeyOf = (vendorId: number, productId: number) => `${vendorId}:${productId}`

function slotDraftFromTarget(t: AndroidThermalTarget | undefined): SlotDraft {
  const d: SlotDraft = {
    type: 'none',
    host: '',
    port: String(ANDROID_THERMAL_DEFAULT_TCP_PORT),
    btAddress: '',
    btName: '',
    usbKey: '',
    usbName: '',
  }
  if (!t) return d
  if (t.type === 'tcp') return { ...d, type: 'tcp', host: t.host, port: String(t.port) }
  if (t.type === 'bluetooth') return { ...d, type: 'bluetooth', btAddress: t.address, btName: t.name ?? '' }
  return { ...d, type: 'usb', usbKey: usbKeyOf(t.vendorId, t.productId), usbName: t.name ?? '' }
}

function targetFromSlotDraft(d: SlotDraft): AndroidThermalTarget | null {
  if (d.type === 'tcp') return normalizeAndroidThermalTarget({ type: 'tcp', host: d.host, port: d.port })
  if (d.type === 'bluetooth') {
    return normalizeAndroidThermalTarget({ type: 'bluetooth', address: d.btAddress, name: d.btName })
  }
  if (d.type === 'usb') {
    const [vendorId, productId] = d.usbKey.split(':').map((n) => Number(n))
    return normalizeAndroidThermalTarget({ type: 'usb', vendorId, productId, name: d.usbName })
  }
  return null
}

function friendlyPrintReason(t: (key: string) => string, reasonRaw: string | undefined): string {
  const reason = String(reasonRaw || '').trim()
  if (reason === 'bluetooth_permission') return t('posAndroidPrintBtPermission')
  if (reason === 'bluetooth_off') return t('posAndroidPrintBtOff')
  if (reason === 'usb_permission_required') return t('posAndroidPrintErrUsbPermission')
  if (reason.startsWith('tcp_') || reason.startsWith('bluetooth_connect') || reason === 'usb_not_found') {
    return `${t('posAndroidPrintErrConnect')} (${reason})`
  }
  return reason || 'print_failed'
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;'
  )
}

function buildTestPrintHtml(slotLabel: string, targetLabel: string): string {
  const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false })
  return `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:2mm 14mm 4mm 3mm;width:80mm;box-sizing:border-box;font-family:sans-serif;font-size:14px;color:#000;background:#fff}
h1{font-size:22px;margin:0 0 2mm}
.row{margin:1mm 0}
.rule{border-top:1px dashed #000;margin:2mm 0;padding-top:2mm}
.right{text-align:right;font-weight:bold}
</style></head><body>
<h1>PRINT TEST</h1>
<div class="row">ทดสอบเครื่องพิมพ์ · 프린터 테스트</div>
<div class="row">${escapeHtml(slotLabel)}</div>
<div class="row">${escapeHtml(targetLabel)}</div>
<div class="row">${escapeHtml(now)} (Asia/Bangkok)</div>
<div class="rule">0123456789 ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
<div class="right">199.00</div>
</body></html>`
}

export function PosAndroidPrinterSettingsButton() {
  const { lang } = useLang()
  const t = useT(lang)
  const [available, setAvailable] = React.useState(false)
  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [message, setMessage] = React.useState<string | null>(null)
  const [base, setBase] = React.useState<AndroidThermalConfig>(defaultAndroidThermalConfig())
  const [slots, setSlots] = React.useState<Record<AndroidThermalSlot, SlotDraft>>(() =>
    Object.fromEntries(ANDROID_THERMAL_SLOTS.map((s) => [s, slotDraftFromTarget(undefined)])) as Record<
      AndroidThermalSlot,
      SlotDraft
    >
  )
  const [btDevices, setBtDevices] = React.useState<BtDevice[]>([])
  const [btNotice, setBtNotice] = React.useState<string | null>(null)
  const [usbDevices, setUsbDevices] = React.useState<UsbDevice[]>([])
  const [testingSlot, setTestingSlot] = React.useState<AndroidThermalSlot | null>(null)

  React.useEffect(() => {
    setAvailable(isAndroidThermalPluginAvailable())
  }, [])

  const scanDevices = React.useCallback(async () => {
    try {
      const bt = await listAndroidBluetoothPrinters()
      setBtDevices(Array.isArray(bt?.devices) ? bt.devices : [])
      if (bt?.reason === 'bluetooth_permission') setBtNotice(t('posAndroidPrintBtPermission'))
      else if (bt?.reason === 'bluetooth_off') setBtNotice(t('posAndroidPrintBtOff'))
      else setBtNotice(null)
    } catch {
      setBtDevices([])
    }
    try {
      const usb = await listAndroidUsbPrinters()
      setUsbDevices(Array.isArray(usb?.devices) ? usb.devices : [])
    } catch {
      setUsbDevices([])
    }
  }, [t])

  const load = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
      const cfg = (await loadAndroidThermalConfig({ force: true })) ?? defaultAndroidThermalConfig()
      setBase(cfg)
      setSlots(
        Object.fromEntries(ANDROID_THERMAL_SLOTS.map((s) => [s, slotDraftFromTarget(cfg.targets[s])])) as Record<
          AndroidThermalSlot,
          SlotDraft
        >
      )
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    if (!open) return
    void load()
    void scanDevices()
  }, [open, load, scanDevices])

  const draftConfig = React.useMemo<AndroidThermalConfig>(() => {
    const targets: AndroidThermalConfig['targets'] = {}
    for (const s of ANDROID_THERMAL_SLOTS) {
      const target = targetFromSlotDraft(slots[s])
      if (target) targets[s] = target
    }
    return { ...base, targets }
  }, [base, slots])

  const patchSlot = (slot: AndroidThermalSlot, patch: Partial<SlotDraft>) => {
    setSlots((prev) => ({ ...prev, [slot]: { ...prev[slot], ...patch } }))
    setMessage(null)
  }

  const onSave = async () => {
    setError(null)
    setMessage(null)
    if (draftConfig.enabled && !hasAnyAndroidThermalTarget(draftConfig)) {
      setError(t('posAndroidPrintNeedTarget'))
      return
    }
    setSaving(true)
    try {
      const ok = await saveAndroidThermalConfig(draftConfig)
      if (ok) setMessage(t('posAndroidPrintSaved'))
      else setError(t('posAndroidPrintSaveFailed'))
    } catch (e) {
      setError(`${t('posAndroidPrintSaveFailed')} (${String(e)})`)
    } finally {
      setSaving(false)
    }
  }

  const onTest = async (slot: AndroidThermalSlot) => {
    const target = targetFromSlotDraft(slots[slot])
    if (!target) return
    setTestingSlot(slot)
    setError(null)
    setMessage(null)
    try {
      const r = await printHtmlViaAndroidThermal(
        buildTestPrintHtml(slotLabel(t, slot), describeAndroidThermalTarget(target)),
        { target, config: draftConfig, cut: true }
      )
      if (r.ok) setMessage(t('posAndroidPrintTestOk'))
      else setError(tr(t, 'posAndroidPrintTestFail', { reason: friendlyPrintReason(t, r.reason) }))
    } finally {
      setTestingSlot(null)
    }
  }

  const onGrantUsb = async (slot: AndroidThermalSlot) => {
    const [vendorId, productId] = slots[slot].usbKey.split(':').map((n) => Number(n))
    if (!vendorId || !productId) return
    await requestAndroidUsbPermission(vendorId, productId)
    await scanDevices()
  }

  if (!available) return null

  const title = t('posAndroidPrintSettings')
  const inputCn = 'h-9 w-full rounded-md border border-input bg-background px-2 text-xs'

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        title={title}
        className="h-8 gap-1 whitespace-nowrap px-2 text-[11px] font-medium sm:gap-1.5 sm:px-3 sm:text-xs"
        onClick={() => setOpen(true)}
      >
        <Printer className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {title}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-left text-sm text-muted-foreground">
              {t('posAndroidPrintSettingsHint')}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={base.enabled}
                onChange={(e) => {
                  const enabled = e.currentTarget.checked
                  setBase((prev) => ({ ...prev, enabled }))
                  setMessage(null)
                }}
              />
              {t('posAndroidPrintEnabled')}
            </label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => void scanDevices()}
              >
                <RotateCw className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                {t('posAndroidPrintRescan')}
              </Button>
              <Button type="button" size="sm" disabled={saving || loading} onClick={() => void onSave()}>
                <Save className="mr-1 h-3.5 w-3.5" />
                {saving ? '…' : t('posAndroidPrintSave')}
              </Button>
            </div>
          </div>

          {error ? (
            <p className="inline-flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
          {message ? (
            <p className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              <span>{message}</span>
            </p>
          ) : null}
          {btNotice ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{btNotice}</p>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 rounded-lg border border-border/70 bg-background p-2.5">
              <span className="block text-xs font-medium">{t('posAndroidPrintPaperWidth')}</span>
              <select
                className={inputCn}
                value={base.paperWidth}
                onChange={(e) => {
                  const paperWidth = e.currentTarget.value === '58' ? 58 : 80
                  setBase((prev) => ({ ...prev, paperWidth }))
                }}
              >
                <option value="80">80mm</option>
                <option value="58">58mm</option>
              </select>
            </label>
            <label className="space-y-1 rounded-lg border border-border/70 bg-background p-2.5">
              <span className="block text-xs font-medium">{t('posAndroidPrintLeftOffset')}</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={8}
                step={0.5}
                className={inputCn}
                value={base.leftOffsetMm}
                onChange={(e) => {
                  const v = Number(e.currentTarget.value)
                  setBase((prev) => ({ ...prev, leftOffsetMm: Number.isFinite(v) ? Math.min(8, Math.max(0, v)) : 0 }))
                }}
              />
            </label>
          </div>

          <p className="text-[11px] text-muted-foreground">{t('posAndroidPrintFallbackHint')}</p>

          <div className="space-y-2">
            {ANDROID_THERMAL_SLOTS.map((slot) => {
              const d = slots[slot]
              const target = targetFromSlotDraft(d)
              const usbRow = usbDevices.find((u) => usbKeyOf(u.vendorId, u.productId) === d.usbKey)
              return (
                <div key={slot} className="space-y-2 rounded-lg border border-border/70 bg-background p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{slotLabel(t, slot)}</span>
                    <div className="flex items-center gap-2">
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={d.type}
                        onChange={(e) => patchSlot(slot, { type: e.currentTarget.value as TargetType })}
                      >
                        <option value="none">{t('posAndroidPrintTypeNone')}</option>
                        <option value="tcp">{t('posAndroidPrintTypeTcp')}</option>
                        <option value="bluetooth">{t('posAndroidPrintTypeBluetooth')}</option>
                        <option value="usb">{t('posAndroidPrintTypeUsb')}</option>
                      </select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={!target || testingSlot != null}
                        onClick={() => void onTest(slot)}
                      >
                        {testingSlot === slot ? '…' : t('posAndroidPrintTest')}
                      </Button>
                    </div>
                  </div>

                  {d.type === 'tcp' ? (
                    <div className="grid grid-cols-[1fr_96px] gap-2">
                      <input
                        className={inputCn}
                        inputMode="decimal"
                        placeholder={t('posAndroidPrintHost')}
                        value={d.host}
                        onChange={(e) => patchSlot(slot, { host: e.currentTarget.value })}
                      />
                      <input
                        className={inputCn}
                        inputMode="numeric"
                        placeholder={t('posAndroidPrintPort')}
                        value={d.port}
                        onChange={(e) => patchSlot(slot, { port: e.currentTarget.value })}
                      />
                    </div>
                  ) : null}

                  {d.type === 'bluetooth' ? (
                    btDevices.length === 0 && !d.btAddress ? (
                      <p className="text-[11px] text-muted-foreground">{t('posAndroidPrintBtEmpty')}</p>
                    ) : (
                      <select
                        className={inputCn}
                        value={d.btAddress}
                        onChange={(e) => {
                          const address = e.currentTarget.value
                          const name = btDevices.find((b) => b.address === address)?.name ?? ''
                          patchSlot(slot, { btAddress: address, btName: name })
                        }}
                      >
                        <option value="">{t('posAndroidPrintPickDevice')}</option>
                        {d.btAddress && !btDevices.some((b) => b.address === d.btAddress) ? (
                          <option value={d.btAddress}>
                            {d.btName || d.btAddress} ({d.btAddress})
                          </option>
                        ) : null}
                        {btDevices.map((b) => (
                          <option key={b.address} value={b.address}>
                            {b.name} ({b.address})
                          </option>
                        ))}
                      </select>
                    )
                  ) : null}

                  {d.type === 'usb' ? (
                    usbDevices.length === 0 && !d.usbKey ? (
                      <p className="text-[11px] text-muted-foreground">{t('posAndroidPrintUsbEmpty')}</p>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          className={inputCn}
                          value={d.usbKey}
                          onChange={(e) => {
                            const key = e.currentTarget.value
                            const name = usbDevices.find((u) => usbKeyOf(u.vendorId, u.productId) === key)?.name ?? ''
                            patchSlot(slot, { usbKey: key, usbName: name })
                          }}
                        >
                          <option value="">{t('posAndroidPrintPickDevice')}</option>
                          {d.usbKey && !usbRow ? <option value={d.usbKey}>{d.usbName || d.usbKey}</option> : null}
                          {usbDevices.map((u) => (
                            <option key={usbKeyOf(u.vendorId, u.productId)} value={usbKeyOf(u.vendorId, u.productId)}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                        {usbRow && !usbRow.hasPermission ? (
                          <Button type="button" variant="outline" size="sm" onClick={() => void onGrantUsb(slot)}>
                            {t('posAndroidPrintUsbGrant')}
                          </Button>
                        ) : null}
                      </div>
                    )
                  ) : null}

                  {target ? (
                    <p className="font-mono text-[11px] text-muted-foreground">{describeAndroidThermalTarget(target)}</p>
                  ) : null}
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
