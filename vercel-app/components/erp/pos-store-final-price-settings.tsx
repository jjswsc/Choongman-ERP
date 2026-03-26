"use client"

import * as React from "react"
import { Save, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPosPrinterSettings, savePosPrinterSettings } from "@/lib/api-client"
import { posPrinterSettingsToSaveParams } from "@/lib/pos-printer-settings-to-save-params"
import { cn } from "@/lib/utils"
import { appAlert } from "@/lib/app-message"

export function PosStoreFinalPriceSettings({ storeCode }: { storeCode: string }) {
  const { lang } = useLang()
  const t = useT(lang)

  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [vatRate, setVatRate] = React.useState("7")
  const [vatMode, setVatMode] = React.useState<"included" | "separate">("included")
  const [serviceRate, setServiceRate] = React.useState("0")
  const [serviceMode, setServiceMode] = React.useState<"included" | "separate">("separate")
  const [cardRate, setCardRate] = React.useState("0")
  const [cardMode, setCardMode] = React.useState<"included" | "separate">("separate")
  const [cardBaseMode, setCardBaseMode] = React.useState<
    "card_only" | "card_plus_vat" | "card_plus_vat_service"
  >("card_only")
  const [otherRate, setOtherRate] = React.useState("0")
  const [otherMode, setOtherMode] = React.useState<"included" | "separate">("separate")

  const load = React.useCallback(() => {
    const s = String(storeCode || "").trim()
    if (!s) return
    setLoading(true)
    getPosPrinterSettings({ storeCode: s })
      .then((settings) => {
        setVatRate(String(settings.vatRate ?? 7))
        setVatMode(settings.vatMode === "separate" ? "separate" : "included")
        setServiceRate(String(settings.serviceRate ?? 0))
        setServiceMode(settings.serviceMode === "included" ? "included" : "separate")
        setCardRate(String(settings.cardRate ?? 0))
        setCardMode(settings.cardMode === "included" ? "included" : "separate")
        setCardBaseMode(
          settings.cardBaseMode === "card_plus_vat"
            ? "card_plus_vat"
            : settings.cardBaseMode === "card_plus_vat_service"
              ? "card_plus_vat_service"
              : "card_only"
        )
        setOtherRate(String(settings.otherRate ?? 0))
        setOtherMode(settings.otherMode === "included" ? "included" : "separate")
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => setLoading(false))
  }, [storeCode])

  React.useEffect(() => {
    load()
  }, [load])

  const handleSave = async () => {
    const s = String(storeCode || "").trim()
    if (!s) {
      await appAlert(t("store") || "매장을 선택하세요.")
      return
    }
    setSaving(true)
    try {
      const latest = await getPosPrinterSettings({ storeCode: s })
      const res = await savePosPrinterSettings({
        ...posPrinterSettingsToSaveParams(latest),
        vatRate: Number(vatRate) || 0,
        vatMode,
        serviceRate: Number(serviceRate) || 0,
        serviceMode,
        cardRate: Number(cardRate) || 0,
        cardMode,
        cardBaseMode,
        otherRate: Number(otherRate) || 0,
        otherMode,
      })
      if (res.success) {
        await appAlert(t("itemsAlertSaved") || "저장되었습니다.")
        load()
      } else {
        await appAlert(res.message || t("msg_save_fail_detail"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (!String(storeCode || "").trim()) {
    return (
      <p className="text-sm text-muted-foreground">{t("store") || "매장"} — {t("loading")}</p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={load} disabled={loading}>
          <RotateCw className={cn("h-4 w-4", loading && "animate-spin")} />
          {t("posRefresh") || "새로고침"}
        </Button>
      </div>
      {loading && (
        <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">{t("loading")}</div>
      )}
      {!loading && (
        <div className="rounded-lg border p-4 space-y-3">
          <p className="text-sm font-medium">{t("posPricingAdjustmentsTitle") || "최종가격 옵션 (매장별)"}</p>
          <p className="text-[11px] text-muted-foreground">
            {t("posPricingAdjustmentsHint") || "각 항목은 % 기준입니다. 포함: 최종금액에 이미 포함, 별도: 최종금액에 추가됩니다."}
          </p>
          <div className="grid gap-3">
            {(
              [
                { key: "vat", label: t("posVatLabel") || "부가세", rate: vatRate, setRate: setVatRate, mode: vatMode, setMode: setVatMode },
                {
                  key: "service",
                  label: t("posServiceFeeLabel") || "서비스비",
                  rate: serviceRate,
                  setRate: setServiceRate,
                  mode: serviceMode,
                  setMode: setServiceMode,
                },
                { key: "card", label: t("posCardFeeLabel") || "카드비", rate: cardRate, setRate: setCardRate, mode: cardMode, setMode: setCardMode },
                { key: "other", label: t("posOtherFeeLabel") || "기타", rate: otherRate, setRate: setOtherRate, mode: otherMode, setMode: setOtherMode },
              ] as const
            ).map((it) => (
              <div key={it.key} className="space-y-1.5">
                <div className="grid gap-2 sm:grid-cols-[120px_1fr_220px] sm:items-center">
                  <label className="text-sm font-medium">{it.label}</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={it.rate}
                    onChange={(e) => it.setRate(e.target.value)}
                    className="h-9"
                    placeholder="0"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => it.setMode("included")}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        it.mode === "included" ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {t("posFeeModeIncluded") || "포함"}
                    </button>
                    <button
                      type="button"
                      onClick={() => it.setMode("separate")}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        it.mode === "separate" ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                      )}
                    >
                      {t("posFeeModeSeparate") || "별도"}
                    </button>
                  </div>
                </div>
                {it.key !== "card" && (
                  <p className="text-[11px] text-muted-foreground sm:pl-[120px]">
                    {it.mode === "included"
                      ? (t("posFeeFormulaIncluded") || "예시) {fee}액 = 기준금액 x ({fee}율 / (100 + {fee}율))").replaceAll("{fee}", it.label)
                      : (t("posFeeFormulaSeparate") || "예시) {fee}액 = 기준금액 x ({fee}율 / 100)").replaceAll("{fee}", it.label)}
                  </p>
                )}
              </div>
            ))}
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <label className="text-sm font-medium">{t("posCardFeeBaseTitle") || "카드비 계산 기준"}</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCardBaseMode("card_only")}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  cardBaseMode === "card_only" ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                )}
              >
                {t("posCardFeeBaseCardOnly") || "카드 결제액 기준"}
              </button>
              <button
                type="button"
                onClick={() => setCardBaseMode("card_plus_vat")}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  cardBaseMode === "card_plus_vat" ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
                )}
              >
                {t("posCardFeeBaseCardPlusVat") || "카드 결제액+부가세 기준"}
              </button>
              <button
                type="button"
                onClick={() => setCardBaseMode("card_plus_vat_service")}
                className={cn(
                  "rounded-md border px-3 py-1.5 text-sm",
                  cardBaseMode === "card_plus_vat_service"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-muted bg-muted/30"
                )}
              >
                {t("posCardFeeBaseCardPlusVatService") || "카드 결제액+부가세+서비스비 기준"}
              </button>
            </div>
            <div className="mt-2 rounded-md border border-dashed bg-background/70 p-2 text-xs text-muted-foreground">
              <p>
                {cardBaseMode === "card_only" && (t("posCardFeeBaseExampleCardOnly") || "예시) 카드비 기준금액 = 카드결제액")}
                {cardBaseMode === "card_plus_vat" &&
                  (t("posCardFeeBaseExampleCardPlusVat") || "예시) 카드비 기준금액 = 카드결제액 + 카드결제액 기준 부가세분")}
                {cardBaseMode === "card_plus_vat_service" &&
                  (t("posCardFeeBaseExampleCardPlusVatService") ||
                    "예시) 카드비 기준금액 = 카드결제액 + 카드결제액 기준 부가세분 + 카드결제액 기준 서비스비분")}
              </p>
              <p className="mt-1">{t("posCardFeeFinalFormula") || "카드비 최종금액 = 카드비 기준금액 x 카드비율(%)"}</p>
            </div>
          </div>
          <Button className="w-full sm:w-auto" onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? "..." : t("itemsBtnSave") || "저장"}
          </Button>
        </div>
      )}
    </div>
  )
}
