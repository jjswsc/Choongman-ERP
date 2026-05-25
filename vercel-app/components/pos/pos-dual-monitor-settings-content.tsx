"use client"

import * as React from "react"
import { Save, RotateCw, MonitorPlay, MonitorX } from "lucide-react"
import { appAlert } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { getPosPrinterSettings, savePosPrinterSettings, type PosPrinterSettings } from "@/lib/api-client"
import { posPrinterSettingsToSaveParams } from "@/lib/pos-printer-settings-to-save-params"
import { ADMIN_UI_LANG_OPTIONS, isLangCode, useLang, type LangCode } from "@/lib/lang-context"
import { useT, tr as i18nTr } from "@/lib/i18n"
import { localizeApiMessage } from "@/lib/translate-api-message"

function ToggleRow({
  label,
  value,
  onChange,
  yesLabel,
  noLabel,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  yesLabel: string
  noLabel: string
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange(true)}
          className={`rounded-md border px-3 py-1 text-sm ${value ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"}`}
        >
          {yesLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange(false)}
          className={`rounded-md border px-3 py-1 text-sm ${!value ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"}`}
        >
          {noLabel}
        </button>
      </div>
    </div>
  )
}

export function PosDualMonitorSettingsContent({ storeCode }: { storeCode: string | null | undefined }) {
  const { lang } = useLang()
  const t = useT(lang)
  const tr = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    return v && v !== key ? v : fallback
  }, [t])
  const yesLabel = tr("yes", "예")
  const noLabel = tr("no", "아니오")

  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [enabled, setEnabled] = React.useState(false)
  const [autoOpen, setAutoOpen] = React.useState(true)
  const [monitorPreference, setMonitorPreference] = React.useState<"secondary-first" | "primary-only">("secondary-first")
  const [displayLangMode, setDisplayLangMode] = React.useState<"follow-pos" | "custom">("follow-pos")
  const [displayLangOverride, setDisplayLangOverride] = React.useState<LangCode>(lang)

  const load = React.useCallback(async () => {
    const sc = String(storeCode || "").trim()
    if (!sc) return
    setLoading(true)
    try {
      const s = await getPosPrinterSettings({ storeCode: sc })
      setEnabled(Boolean(s.dualMonitorEnabled))
      setAutoOpen(s.customerDisplayAutoOpen !== false)
      setMonitorPreference(
        s.customerDisplayMonitorPreference === "primary-only" ? "primary-only" : "secondary-first"
      )
      const rawDisplayLangOverride = String(s.customerDisplayLangOverride ?? "").trim()
      const normalizedDisplayLangOverride = isLangCode(rawDisplayLangOverride) ? rawDisplayLangOverride : lang
      setDisplayLangMode(
        s.customerDisplayLangMode === "custom" && isLangCode(rawDisplayLangOverride) ? "custom" : "follow-pos"
      )
      setDisplayLangOverride(normalizedDisplayLangOverride)
    } finally {
      setLoading(false)
    }
  }, [lang, storeCode])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleSave = React.useCallback(async () => {
    const sc = String(storeCode || "").trim()
    if (!sc) {
      await appAlert(tr("store", "매장") + " " + tr("required", "필수"))
      return
    }
    setSaving(true)
    try {
      const latest = await getPosPrinterSettings({ storeCode: sc })
      const merged: PosPrinterSettings = {
        ...latest,
        storeCode: sc,
        dualMonitorEnabled: enabled,
        customerDisplayAutoOpen: autoOpen,
        customerDisplayMonitorPreference: monitorPreference,
        customerDisplayLangMode: displayLangMode,
        customerDisplayLangOverride: displayLangMode === "custom" ? displayLangOverride : "",
      }
      const res = await savePosPrinterSettings(
        posPrinterSettingsToSaveParams(merged, { omitKitchenRoutes: true })
      )
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, tr("msg_save_fail_detail", "저장에 실패했습니다."), lang))
        return
      }
      const shell = window.cmPosShell
      if (typeof shell?.configureCustomerDisplay === "function") {
        await shell.configureCustomerDisplay({
          enabled,
          autoOpen,
          monitorPreference,
        })
      }
      await appAlert(tr("itemsAlertSaved", "저장되었습니다."))
      void load()
    } finally {
      setSaving(false)
    }
  }, [autoOpen, displayLangMode, displayLangOverride, enabled, load, monitorPreference, storeCode, tr])

  const openNow = React.useCallback(async () => {
    const shell = window.cmPosShell
    if (typeof shell?.openCustomerDisplayWindow !== "function") {
      await appAlert(tr("posDualMonitorShellOnly", "Windows POS 앱에서만 사용할 수 있습니다."))
      return
    }
    const res = await shell.openCustomerDisplayWindow()
    if (!res?.ok) {
      await appAlert(
        i18nTr(t, "posDualMonitorCustomerOpenFailed", {
          reason: String(res?.reason || "open_failed"),
        })
      )
    }
  }, [t, tr])

  const closeNow = React.useCallback(async () => {
    const shell = window.cmPosShell
    if (typeof shell?.closeCustomerDisplayWindow !== "function") {
      await appAlert(tr("posDualMonitorShellOnly", "Windows POS 앱에서만 사용할 수 있습니다."))
      return
    }
    const res = await shell.closeCustomerDisplayWindow()
    if (!res?.ok) {
      await appAlert(
        i18nTr(t, "posDualMonitorCustomerCloseFailed", {
          reason: String(res?.reason || "close_failed"),
        })
      )
    }
  }, [t, tr])

  if (!String(storeCode || "").trim()) {
    return <p className="text-sm text-muted-foreground">{tr("store", "매장")} {tr("required", "필수")}</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
          <RotateCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {tr("posRefresh", "새로고침")}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void openNow()}>
          <MonitorPlay className="h-4 w-4" />
          {tr("posDualMonitorOpenNow", "고객 화면 열기")}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void closeNow()}>
          <MonitorX className="h-4 w-4" />
          {tr("posDualMonitorCloseNow", "고객 화면 닫기")}
        </Button>
      </div>
      <ToggleRow
        label={tr("posDualMonitorEnabled", "듀얼 모니터 고객화면 사용")}
        value={enabled}
        onChange={setEnabled}
        yesLabel={yesLabel}
        noLabel={noLabel}
      />
      <ToggleRow
        label={tr("posDualMonitorAutoOpen", "POS 시작/설정 반영 시 자동 열기")}
        value={autoOpen}
        onChange={setAutoOpen}
        yesLabel={yesLabel}
        noLabel={noLabel}
      />
      <div>
        <label className="text-sm font-medium">{tr("posDualMonitorTarget", "고객창 모니터 배치")}</label>
        <Select
          value={monitorPreference}
          onValueChange={(v) => setMonitorPreference(v as "secondary-first" | "primary-only")}
        >
          <SelectTrigger className="mt-1 h-10 w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="secondary-first">{tr("posDualMonitorSecondaryFirst", "보조 모니터 우선 (없으면 주 모니터)")}</SelectItem>
            <SelectItem value="primary-only">{tr("posDualMonitorPrimaryOnly", "주 모니터 고정")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium">{tr("posCustomerDisplayLanguage", "고객화면 언어")}</label>
        <p className="mt-1 text-xs text-muted-foreground">
          {tr(
            "posCustomerDisplayLanguageHint",
            "기본은 POS 직원 화면의 언어를 따라가고, 필요하면 고객화면만 다른 언어로 고정할 수 있습니다."
          )}
        </p>
        <Select
          value={displayLangMode}
          onValueChange={(v) => setDisplayLangMode(v === "custom" ? "custom" : "follow-pos")}
        >
          <SelectTrigger className="mt-2 h-10 w-full max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="follow-pos">
              {tr("posCustomerDisplayLanguageFollowPos", "POS 직원 화면 언어 따라감")}
            </SelectItem>
            <SelectItem value="custom">
              {tr("posCustomerDisplayLanguageCustom", "고객화면만 별도 언어 고정")}
            </SelectItem>
          </SelectContent>
        </Select>
        {displayLangMode === "custom" ? (
          <div className="mt-3">
            <label className="text-xs font-medium text-muted-foreground">{tr("posLanguage", "언어")}</label>
            <Select value={displayLangOverride} onValueChange={(v) => isLangCode(v) && setDisplayLangOverride(v)}>
              <SelectTrigger className="mt-1 h-10 w-full max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADMIN_UI_LANG_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        {tr("posDualMonitorHint", "자동 감지는 Windows POS(Electron)에서만 동작합니다. 웹 브라우저 환경에서는 수동 창 열기만 가능합니다.")}
      </p>
      <Button type="button" className="w-full" onClick={() => void handleSave()} disabled={saving || loading}>
        <Save className="mr-2 h-4 w-4" />
        {saving ? tr("posPrinterSaving", "저장 중...") : tr("itemsBtnSave", "저장")}
      </Button>
    </div>
  )
}
