"use client"

import * as React from "react"
import { Save, RotateCw } from "lucide-react"
import { appAlert } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  getPosPrinterSettings,
  savePosPrinterSettings,
  uploadCustomerDisplayMedia,
  type PosPrinterSettings,
} from "@/lib/api-client"
import { posPrinterSettingsToSaveParams } from "@/lib/pos-printer-settings-to-save-params"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
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

export type PosCustomerDisplayContentSettingsHandle = {
  save: () => Promise<void>
  reload: () => Promise<void>
}

export const PosCustomerDisplayContentSettings = React.forwardRef<
  PosCustomerDisplayContentSettingsHandle,
  {
    storeCode: string | null | undefined
    /** 상단 공통 툴바에 저장·새로고침을 둘 때 본문의 해당 버튼 숨김 */
    toolbarMode?: "default" | "embedded"
  }
>(function PosCustomerDisplayContentSettings({ storeCode, toolbarMode = "default" }, ref) {
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
  const [theme, setTheme] = React.useState<"dark" | "light" | "brand">("dark")
  const [defaultState, setDefaultState] = React.useState<"idle" | "qr">("idle")
  const [idleMessage, setIdleMessage] = React.useState("")
  const [paymentMessage, setPaymentMessage] = React.useState("")
  const [qrPayload, setQrPayload] = React.useState("")
  const [showOrderSummary, setShowOrderSummary] = React.useState(true)
  const [showOrderTotal, setShowOrderTotal] = React.useState(true)
  const [idleMediaType, setIdleMediaType] = React.useState<"none" | "image" | "video">("none")
  const [idleMediaUrl, setIdleMediaUrl] = React.useState("")
  const [uploadingMedia, setUploadingMedia] = React.useState(false)

  const load = React.useCallback(async () => {
    const sc = String(storeCode || "").trim()
    if (!sc) return
    setLoading(true)
    try {
      const s = await getPosPrinterSettings({ storeCode: sc })
      setEnabled(Boolean(s.dualMonitorEnabled))
      setTheme(
        s.customerDisplayTheme === "light" ? "light" : s.customerDisplayTheme === "brand" ? "brand" : "dark"
      )
      setDefaultState(s.customerDisplayDefaultState === "qr" ? "qr" : "idle")
      setIdleMessage(String(s.customerDisplayIdleMessage ?? "").trim())
      setPaymentMessage(String(s.customerDisplayPaymentMessage ?? "").trim())
      setQrPayload(String(s.customerDisplayQrPayload ?? "").trim())
      setShowOrderSummary(s.customerDisplayShowOrderSummary !== false)
      setShowOrderTotal(s.customerDisplayShowOrderTotal !== false)
      const mt = String(s.customerDisplayIdleMediaType || "none").toLowerCase()
      setIdleMediaType(mt === "image" ? "image" : mt === "video" ? "video" : "none")
      setIdleMediaUrl(String(s.customerDisplayIdleMediaUrl ?? "").trim())
    } finally {
      setLoading(false)
    }
  }, [storeCode])

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
        customerDisplayTheme: theme,
        customerDisplayDefaultState: defaultState,
        customerDisplayIdleMessage: idleMessage.trim(),
        customerDisplayPaymentMessage: paymentMessage.trim(),
        customerDisplayQrPayload: qrPayload.trim(),
        customerDisplayShowOrderSummary: showOrderSummary,
        customerDisplayShowOrderTotal: showOrderTotal,
        customerDisplayIdleMediaType: idleMediaType,
        customerDisplayIdleMediaUrl: idleMediaUrl.trim(),
      }
      const res = await savePosPrinterSettings(
        posPrinterSettingsToSaveParams(merged, { omitKitchenRoutes: true })
      )
      if (!res.success) {
        await appAlert(localizeApiMessage(res.message, t, tr("msg_save_fail_detail", "저장에 실패했습니다."), lang))
        return
      }
      await appAlert(tr("itemsAlertSaved", "저장되었습니다."))
      void load()
    } finally {
      setSaving(false)
    }
  }, [
    defaultState,
    enabled,
    idleMediaType,
    idleMediaUrl,
    idleMessage,
    load,
    paymentMessage,
    qrPayload,
    showOrderSummary,
    showOrderTotal,
    storeCode,
    theme,
    tr,
  ])

  React.useImperativeHandle(
    ref,
    () => ({
      save: () => handleSave(),
      reload: () => load(),
    }),
    [handleSave, load]
  )

  const embedded = toolbarMode === "embedded"

  const onPickMediaFile = React.useCallback(
    async (file: File | null) => {
      const sc = String(storeCode || "").trim()
      if (!file || !sc) return
      if (idleMediaType === "none") {
        await appAlert(tr("posCustomerIdleMediaPickType", "먼저 사진 또는 동영상을 선택해 주세요."))
        return
      }
      setUploadingMedia(true)
      try {
        const res = await uploadCustomerDisplayMedia({ storeCode: sc, file })
        if (!res.success || !res.url) {
          await appAlert(localizeApiMessage(res.message, t, tr("msg_save_fail_detail", "저장에 실패했습니다."), lang))
          return
        }
        setIdleMediaUrl(res.url)
        await appAlert(tr("posCustomerIdleMediaUploaded", "미디어가 업로드되었습니다. 저장을 눌러 반영하세요."))
      } finally {
        setUploadingMedia(false)
      }
    },
    [idleMediaType, storeCode, tr]
  )

  if (!String(storeCode || "").trim()) {
    return <p className="text-sm text-muted-foreground">{tr("store", "매장")} {tr("required", "필수")}</p>
  }

  return (
    <div className="space-y-4">
      {!embedded ? (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
            <RotateCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {tr("posRefresh", "새로고침")}
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {tr(
          "posCustomerDisplayLogoHint",
          "주문·결제·QR 화면 상단 로고는 POS 프린터 설정 → 영수증 디자인 탭의 로고 이미지와 동일하게 표시됩니다."
        )}
      </p>
      <ToggleRow
        label={tr("posDualMonitorEnabled", "듀얼 모니터 고객화면 사용")}
        value={enabled}
        onChange={setEnabled}
        yesLabel={yesLabel}
        noLabel={noLabel}
      />
      <div>
        <label className="text-sm font-medium">{tr("posCustomerDisplayTheme", "고객화면 테마")}</label>
        <Select value={theme} onValueChange={(v) => setTheme(v as "dark" | "light" | "brand")}>
          <SelectTrigger className="mt-1 h-10 w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">{tr("posCustomerThemeDark", "다크")}</SelectItem>
            <SelectItem value="light">{tr("posCustomerThemeLight", "라이트")}</SelectItem>
            <SelectItem value="brand">{tr("posCustomerThemeBrand", "브랜드")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium">{tr("posCustomerDisplayDefaultState", "평상시 화면")}</label>
        <Select value={defaultState} onValueChange={(v) => setDefaultState(v as "idle" | "qr")}>
          <SelectTrigger className="mt-1 h-10 w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="idle">{tr("posCustomerStateIdle", "평상시 안내")}</SelectItem>
            <SelectItem value="qr">{tr("posCustomerStateQr", "QR 화면")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium">{tr("posCustomerIdleMedia", "평상시 배경 미디어")}</label>
        <p className="mt-1 text-xs text-muted-foreground">
          {tr(
            "posCustomerIdleMediaHint",
            "평상시 안내 화면 뒤에 표시할 사진 또는 동영상입니다. (이미지 4MB 이하, 동영상 50MB 이하 MP4/WebM)"
          )}
        </p>
        <Select
          value={idleMediaType}
          onValueChange={(v) => setIdleMediaType(v as "none" | "image" | "video")}
        >
          <SelectTrigger className="mt-2 h-10 w-full max-w-md">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{tr("posCustomerIdleMediaNone", "사용 안 함")}</SelectItem>
            <SelectItem value="image">{tr("posCustomerIdleMediaImage", "사진")}</SelectItem>
            <SelectItem value="video">{tr("posCustomerIdleMediaVideo", "동영상")}</SelectItem>
          </SelectContent>
        </Select>
        {idleMediaType !== "none" ? (
          <div className="mt-3 space-y-2">
            <Input
              type="file"
              accept={idleMediaType === "video" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/gif,image/webp"}
              className="cursor-pointer"
              disabled={uploadingMedia}
              onChange={(e) => {
                const f = e.target.files?.[0]
                void onPickMediaFile(f ?? null)
                e.target.value = ""
              }}
            />
            <Input
              value={idleMediaUrl}
              onChange={(e) => setIdleMediaUrl(e.target.value)}
              className="h-10"
              placeholder={tr("posCustomerIdleMediaUrlPh", "또는 공개 URL 직접 입력")}
              disabled={uploadingMedia}
            />
            {idleMediaUrl ? (
              <div className="overflow-hidden rounded-md border bg-muted/30 p-2">
                {idleMediaType === "video" ? (
                  <video src={idleMediaUrl} className="mx-auto max-h-40 w-full object-contain" controls muted />
                ) : (
                   
                  <img src={idleMediaUrl} alt="" className="mx-auto max-h-40 w-full object-contain" />
                )}
              </div>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setIdleMediaUrl("")
              }}
              disabled={uploadingMedia}
            >
              {tr("posCustomerIdleMediaClear", "미디어 지우기")}
            </Button>
          </div>
        ) : null}
      </div>
      <div>
        <label className="text-sm font-medium">{tr("posCustomerIdleMessage", "평상시 문구")}</label>
        <Textarea
          value={idleMessage}
          onChange={(e) => setIdleMessage(e.target.value)}
          className="mt-1 min-h-[72px]"
          placeholder={tr("posCustomerIdleMessagePh", "예: 주문해 주셔서 감사합니다")}
        />
      </div>
      <div>
        <label className="text-sm font-medium">{tr("posCustomerPaymentMessage", "결제중 문구")}</label>
        <Textarea
          value={paymentMessage}
          onChange={(e) => setPaymentMessage(e.target.value)}
          className="mt-1 min-h-[72px]"
          placeholder={tr("posCustomerPaymentMessagePh", "예: 결제 진행 중입니다. 잠시만 기다려 주세요.")}
        />
      </div>
      <div>
        <label className="text-sm font-medium">{tr("posCustomerQrPayload", "QR 데이터")}</label>
        <Input
          value={qrPayload}
          onChange={(e) => setQrPayload(e.target.value)}
          className="mt-1 h-10"
          placeholder={tr("posCustomerQrPayloadPh", "https://... 또는 텍스트")}
        />
      </div>
      <ToggleRow
        label={tr("posCustomerShowOrderSummary", "주문중 화면에서 품목 목록 표시")}
        value={showOrderSummary}
        onChange={setShowOrderSummary}
        yesLabel={yesLabel}
        noLabel={noLabel}
      />
      <ToggleRow
        label={tr("posCustomerShowOrderTotal", "주문/결제 화면에서 합계 표시")}
        value={showOrderTotal}
        onChange={setShowOrderTotal}
        yesLabel={yesLabel}
        noLabel={noLabel}
      />
      {!embedded ? (
        <Button type="button" className="w-full" onClick={() => void handleSave()} disabled={saving || loading}>
          <Save className="mr-2 h-4 w-4" />
          {saving ? tr("posPrinterSaving", "저장 중...") : tr("itemsBtnSave", "저장")}
        </Button>
      ) : null}
    </div>
  )
})

PosCustomerDisplayContentSettings.displayName = "PosCustomerDisplayContentSettings"
