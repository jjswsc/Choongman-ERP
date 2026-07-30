"use client"

import * as React from "react"
import { Save, RotateCw, ChevronUp, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getPosPrinterSettings, savePosPrinterSettings } from "@/lib/api-client"
import { posPrinterSettingsToSaveParams } from "@/lib/pos-printer-settings-to-save-params"
import { cn } from "@/lib/utils"
import { appAlert } from "@/lib/app-message"
import {
  computePosPricing,
  normalizeFeeStackMode,
  normalizeFeeStackOrder,
  normalizePaymentTotalRoundingMode,
  type PosFeeStackKey,
  type PosFeeStackMode,
  type PosPaymentTotalRoundingMode,
} from "@/lib/pos-pricing"

type FeeStackPreset = "parallel" | "service_vat" | "vat_service" | "custom"

function detectFeeStackPreset(mode: PosFeeStackMode, order: PosFeeStackKey[]): FeeStackPreset {
  if (mode !== "sequential") return "parallel"
  const svc = order.indexOf("service")
  const vat = order.indexOf("vat")
  const other = order.indexOf("other")
  if (svc === 0 && vat === 1 && other === 2) return "service_vat"
  if (vat === 0 && svc === 1 && other === 2) return "vat_service"
  return "custom"
}

function formatBaht(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

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
  const [feeStackMode, setFeeStackMode] = React.useState<PosFeeStackMode>("parallel")
  const [feeStackOrder, setFeeStackOrder] = React.useState<PosFeeStackKey[]>(["service", "vat", "other"])
  const [paymentTotalRoundingMode, setPaymentTotalRoundingMode] =
    React.useState<PosPaymentTotalRoundingMode>("round")
  const [deliveryFee, setDeliveryFee] = React.useState("0")
  const [packagingFee, setPackagingFee] = React.useState("0")
  const [autoStockDeduction, setAutoStockDeduction] = React.useState(false)
  const [previewBase, setPreviewBase] = React.useState("1000")

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
        setFeeStackMode(normalizeFeeStackMode(settings.feeStackMode))
        setFeeStackOrder(normalizeFeeStackOrder(settings.feeStackOrder))
        setPaymentTotalRoundingMode(
          normalizePaymentTotalRoundingMode(settings.paymentTotalRoundingMode)
        )
        setDeliveryFee(String(settings.deliveryFee ?? 0))
        setPackagingFee(String(settings.packagingFee ?? 0))
        setAutoStockDeduction(Boolean(settings.autoStockDeduction))
      })
      .catch(() => {
        /* ignore */
      })
      .finally(() => setLoading(false))
  }, [storeCode])

  React.useEffect(() => {
    load()
  }, [load])

  const applyPreset = (preset: Exclude<FeeStackPreset, "custom">) => {
    if (preset === "parallel") {
      setFeeStackMode("parallel")
      return
    }
    setFeeStackMode("sequential")
    if (preset === "service_vat") setFeeStackOrder(["service", "vat", "other"])
    else setFeeStackOrder(["vat", "service", "other"])
  }

  const moveOrder = (key: PosFeeStackKey, dir: -1 | 1) => {
    setFeeStackMode("sequential")
    setFeeStackOrder((prev) => {
      const next = [...prev]
      const i = next.indexOf(key)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= next.length) return prev
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const activePreset = detectFeeStackPreset(feeStackMode, feeStackOrder)

  const feeLabel = (key: PosFeeStackKey) => {
    if (key === "vat") return t("posVatLabel") || "부가세"
    if (key === "service") return t("posServiceFeeLabel") || "서비스비"
    return t("posOtherFeeLabel") || "기타"
  }

  const feeModeOf = (key: PosFeeStackKey) => {
    if (key === "vat") return vatMode
    if (key === "service") return serviceMode
    return otherMode
  }

  const feeRateOf = (key: PosFeeStackKey) => {
    if (key === "vat") return Number(vatRate) || 0
    if (key === "service") return Number(serviceRate) || 0
    return Number(otherRate) || 0
  }

  const previewPricing = React.useMemo(() => {
    const base = Math.max(0, Number(previewBase) || 0)
    return computePosPricing({
      subtotal: base,
      adjustments: {
        vatRate: Number(vatRate) || 0,
        vatMode,
        serviceRate: Number(serviceRate) || 0,
        serviceMode,
        cardRate: 0,
        cardMode: "separate",
        otherRate: Number(otherRate) || 0,
        otherMode,
        feeStackMode,
        feeStackOrder,
        paymentTotalRoundingMode,
      },
    })
  }, [
    previewBase,
    vatRate,
    vatMode,
    serviceRate,
    serviceMode,
    otherRate,
    otherMode,
    feeStackMode,
    feeStackOrder,
    paymentTotalRoundingMode,
  ])

  const previewSteps = React.useMemo(() => {
    const steps: string[] = []
    const base = previewPricing.baseTotal
    steps.push(`${t("posFeeStackPreviewBase") || "기준"} ${formatBaht(base)}฿`)
    if (feeStackMode === "sequential") {
      let running = base
      for (const key of feeStackOrder) {
        if (feeModeOf(key) !== "separate" || feeRateOf(key) <= 0) continue
        const amt =
          key === "vat"
            ? previewPricing.vatFeeAmt
            : key === "service"
              ? previewPricing.serviceFeeAmt
              : previewPricing.otherFeeAmt
        running = Math.round((running + amt) * 100) / 100
        steps.push(`+ ${feeLabel(key)} ${formatBaht(amt)}฿ → ${formatBaht(running)}฿`)
      }
    } else {
      if (serviceMode === "separate" && previewPricing.serviceFeeAmt > 0) {
        steps.push(`+ ${feeLabel("service")} ${formatBaht(previewPricing.serviceFeeAmt)}฿`)
      }
      if (vatMode === "separate" && previewPricing.vatFeeAmt > 0) {
        steps.push(`+ ${feeLabel("vat")} ${formatBaht(previewPricing.vatFeeAmt)}฿`)
      }
      if (otherMode === "separate" && previewPricing.otherFeeAmt > 0) {
        steps.push(`+ ${feeLabel("other")} ${formatBaht(previewPricing.otherFeeAmt)}฿`)
      }
    }
    if (paymentTotalRoundingMode === "round") {
      steps.push(t("posPaymentTotalRoundingPreviewRound") || "합계 처리: 반올림(정수 ฿)")
    } else if (paymentTotalRoundingMode === "floor") {
      steps.push(t("posPaymentTotalRoundingPreviewFloor") || "합계 처리: 반내림(정수 ฿)")
    } else {
      steps.push(t("posPaymentTotalRoundingPreviewNone") || "합계 처리: 그대로(소수 유지)")
    }
    steps.push(`${t("posFeeStackPreviewFinal") || "최종"} ${formatBaht(previewPricing.finalTotal)}฿`)
    return steps
    // eslint-disable-next-line react-hooks/exhaustive-deps -- labels via t/feeLabel are stable enough for preview
  }, [
    previewPricing,
    feeStackMode,
    feeStackOrder,
    serviceMode,
    vatMode,
    otherMode,
    paymentTotalRoundingMode,
    t,
    lang,
  ])

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
        feeStackMode,
        feeStackOrder,
        paymentTotalRoundingMode,
        deliveryFee: Math.max(0, Number(deliveryFee) || 0),
        packagingFee: Math.max(0, Number(packagingFee) || 0),
        autoStockDeduction,
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

  const presetBtn = (preset: Exclude<FeeStackPreset, "custom">, label: string) => (
    <button
      type="button"
      key={preset}
      onClick={() => applyPreset(preset)}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm",
        activePreset === preset ? "border-primary bg-primary/10 text-primary" : "border-muted bg-muted/30"
      )}
    >
      {label}
    </button>
  )

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
          <div className="rounded-md border border-dashed bg-muted/15 p-3 space-y-3">
            <div>
              <p className="text-sm font-medium">{t("posStoreFixedFeesSection") || "배달·포장 정액 수수료"}</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {t("posStoreFixedFeesHint") ||
                  "배달 주문에는 배달 수수료, 포장 주문에는 포장 수수료가 합계에 더해집니다."}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">{t("posDeliveryFee") || "배달 수수료"} (฿)</label>
                <Input
                  type="number"
                  min={0}
                  value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t("posPackagingFee") || "포장 수수료"} (฿)</label>
                <Input
                  type="number"
                  min={0}
                  value={packagingFee}
                  onChange={(e) => setPackagingFee(e.target.value)}
                  className="mt-1 h-9"
                />
              </div>
            </div>
          </div>

          <div className="rounded-md border border-dashed bg-muted/15 p-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{t("posAutoStockDeduction") || "자동 재고 차감"}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t("posAutoStockDeductionHint") ||
                    "주문 완료 시 메뉴 BOM에 따라 재고가 자동 차감됩니다. 매장 적응 후 사용하세요."}
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 shrink-0">
                <input
                  type="checkbox"
                  checked={autoStockDeduction}
                  onChange={(e) => setAutoStockDeduction(e.target.checked)}
                  className="h-4 w-4"
                />
                <span className="text-sm">{t("posUse") || "사용"}</span>
              </label>
            </div>
          </div>

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

          <div className="rounded-md border bg-muted/20 p-3 space-y-3">
            <div>
              <label className="text-sm font-medium">{t("posFeeStackTitle") || "별도 항목 적용 순서"}</label>
              <p className="text-[11px] text-muted-foreground mt-1">
                {t("posFeeStackHint") ||
                  "병렬: 각각 기준금액에 독립 계산. 누적: 위에서 아래 순서로 직전 금액에 %를 적용합니다. 포함 항목은 순서에 영향 없습니다."}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {presetBtn("parallel", t("posFeeStackParallel") || "병렬(현행)")}
              {presetBtn("service_vat", t("posFeeStackServiceThenVat") || "서비스 → 부가세")}
              {presetBtn("vat_service", t("posFeeStackVatThenService") || "부가세 → 서비스")}
              {activePreset === "custom" && (
                <span className="rounded-md border border-primary bg-primary/10 px-3 py-1.5 text-sm text-primary">
                  {t("posFeeStackCustom") || "사용자 지정"}
                </span>
              )}
            </div>

            {feeStackMode === "sequential" && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("posFeeStackOrderTitle") || "적용 파이프라인 (위→아래)"}
                </p>
                <div className="space-y-1.5">
                  <div className="rounded-md border border-dashed bg-background/80 px-3 py-2 text-sm text-muted-foreground">
                    {t("posFeeStackStepBase") || "① 기준금액 (메뉴합 − 할인 + 배달/포장)"}
                  </div>
                  {feeStackOrder.map((key, idx) => {
                    const separate = feeModeOf(key) === "separate"
                    const rate = feeRateOf(key)
                    const inactive = !separate || rate <= 0
                    return (
                      <div
                        key={key}
                        className={cn(
                          "flex items-center gap-2 rounded-md border bg-background px-2 py-1.5",
                          inactive && "opacity-50"
                        )}
                      >
                        <span className="w-5 text-xs text-muted-foreground tabular-nums">{idx + 2}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">
                            {feeLabel(key)}
                            {rate > 0 ? ` ${rate}%` : ""}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {inactive
                              ? separate
                                ? t("posFeeStackInactiveZero") || "요율 0% — 적용 안 함"
                                : t("posFeeStackInactiveIncluded") || "포함 — 합계에 추가하지 않음(분해만)"
                              : t("posFeeStackApplyOnPrev") || "직전 금액에 % 적용 후 누적"}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            type="button"
                            aria-label={t("posFeeStackMoveUp") || "위로"}
                            disabled={idx === 0}
                            onClick={() => moveOrder(key, -1)}
                            className="rounded border p-1 disabled:opacity-30"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={t("posFeeStackMoveDown") || "아래로"}
                            disabled={idx === feeStackOrder.length - 1}
                            onClick={() => moveOrder(key, 1)}
                            className="rounded border p-1 disabled:opacity-30"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="rounded-md border border-dashed bg-background/70 p-3 space-y-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[140px]">
                  <label className="text-xs font-medium">{t("posFeeStackPreviewTitle") || "미리보기 기준금액"} (฿)</label>
                  <Input
                    type="number"
                    min={0}
                    value={previewBase}
                    onChange={(e) => setPreviewBase(e.target.value)}
                    className="mt-1 h-8"
                  />
                </div>
              </div>
              <ol className="space-y-0.5 text-xs text-muted-foreground">
                {previewSteps.map((line, i) => (
                  <li key={i} className={i === previewSteps.length - 1 ? "font-medium text-foreground" : undefined}>
                    {line}
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-md border bg-muted/20 p-3 space-y-2">
              <div>
                <label className="text-sm font-medium">
                  {t("posPaymentTotalRoundingTitle") || "결제 합계 반올림"}
                </label>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {t("posPaymentTotalRoundingHint") ||
                    "VAT·서비스비 반영 후 최종 합계를 정수 바트로 맞출지 선택합니다. 영수증 Rounding 행에 차액이 표시됩니다."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["round", t("posPaymentTotalRoundingRound") || "반올림"],
                    ["floor", t("posPaymentTotalRoundingFloor") || "반내림"],
                    ["none", t("posPaymentTotalRoundingNone") || "그대로"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    type="button"
                    key={mode}
                    onClick={() => setPaymentTotalRoundingMode(mode)}
                    className={cn(
                      "rounded-md border px-3 py-1.5 text-sm",
                      paymentTotalRoundingMode === mode
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted bg-muted/30"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
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
