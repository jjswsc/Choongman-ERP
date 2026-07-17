"use client"

import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Input } from "@/components/ui/input"
import { TrendingUp, TrendingDown, DollarSign, Percent, Package, ChefHat } from "lucide-react"

interface CostSummaryProps {
  foodSubTotal: number
  packagingSubTotal: number
  misePercent: number
  inclVat: number
  /** 가격이 VAT 포함인지 (false면 inclVat이 이미 VAT 제외, 기본 true) */
  vatIncluded?: boolean
  serviceType: "Dine-In" | "Delivery"
  deliveryPercent: number
  /** 앱 수수료(%) 변경 시 (원가 내역에서 직접 조정) */
  onDeliveryPercentChange?: (percent: number) => void
  /** true면 품목별 미세가 이미 foodSubTotal에 포함됨 (메뉴 레벨 미세 미적용) */
  miseIncludedInFood?: boolean
  /** 목록 API 원가 베이스 — 제공 시 총원가를 목록 열(미세 포함)과 동일하게 */
  listAlignedCostHall?: number
  listAlignedCostDelivery?: number
  /** 가격 편집 가능 (메뉴 관리 연동) */
  editablePrice?: boolean
  /** 가격 변경 시 (priceHall, priceDelivery) - 저장 시 메뉴 관리에 반영 */
  onPriceChange?: (priceHall: number, priceDelivery: number | null) => void
  /** 옵션인 경우 base price (modifier 계산용) */
  basePriceHall?: number
  basePriceDelivery?: number | null
}

export function CostSummary({
  foodSubTotal,
  packagingSubTotal,
  misePercent,
  inclVat,
  vatIncluded = true,
  serviceType,
  deliveryPercent,
  onDeliveryPercentChange,
  miseIncludedInFood = false,
  listAlignedCostHall,
  listAlignedCostDelivery,
  editablePrice: _editablePrice = false,
  onPriceChange: _onPriceChange,
  basePriceHall: _basePriceHall,
  basePriceDelivery: _basePriceDelivery,
}: CostSummaryProps) {
  const { lang } = useLang()
  const t = useT(lang)

  const useListAligned =
    listAlignedCostHall != null &&
    Number.isFinite(listAlignedCostHall) &&
    listAlignedCostHall >= 0

  const baseHall = useListAligned ? listAlignedCostHall! : foodSubTotal
  const baseDel = useListAligned
    ? (listAlignedCostDelivery ?? listAlignedCostHall!)
    : foodSubTotal + (serviceType === "Delivery" ? packagingSubTotal : 0)
  const packagingBase = useListAligned
    ? Math.max(0, baseDel - baseHall)
    : packagingSubTotal

  const foodCost = baseHall
  const totalFoodCost = foodCost
  const deliveryPackageCost = serviceType === "Delivery" ? packagingBase : 0
  const totalCost = useListAligned
    ? serviceType === "Delivery"
      ? baseDel
      : baseHall
    : serviceType === "Delivery"
      ? totalFoodCost + deliveryPackageCost
      : totalFoodCost

  const exclVat = vatIncluded ? inclVat / 1.07 : inclVat
  const deliveryFee = serviceType === "Delivery" ? inclVat * (deliveryPercent / 100) : 0
  /** 원가율·마진 분모는 VAT 제외 매출만 — 배달앱 수수료는 참고 표시만 */
  const margin = exclVat - totalCost
  const marginPercent = exclVat > 0 ? (margin / exclVat) * 100 : 0
  const costPercent = exclVat > 0 ? (totalCost / exclVat) * 100 : 0

  const isHealthyMargin = marginPercent >= 60

  return (
    <div className="space-y-4">
      {/* Main Metrics Row: 가격, 마진, 마진율, 원가율 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-xl border border-border bg-card p-3 relative overflow-hidden flex flex-col items-center text-center">
          <div className="absolute top-0 right-0 h-14 w-14 rounded-bl-full bg-primary/5" />
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <DollarSign className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
              {t("posCostPrice") || "가격"}
            </span>
          </div>
          <p className="font-mono text-xl font-extrabold text-foreground text-center w-full">
            {inclVat.toFixed(2)}
          </p>
        </div>

        <div
          className={cn(
            "rounded-xl border p-3 relative overflow-hidden flex flex-col",
            isHealthyMargin
              ? "border-primary/30 bg-primary/5"
              : "border-chart-2/30 bg-chart-2/5"
          )}
        >
          <div
            className={cn(
              "absolute top-0 right-0 h-14 w-14 rounded-bl-full",
              isHealthyMargin ? "bg-primary/10" : "bg-chart-2/10"
            )}
          />
          <div className="flex items-center gap-1.5 mb-1.5">
            <div
              className={cn(
                "rounded-lg p-1.5",
                isHealthyMargin ? "bg-primary/20" : "bg-chart-2/20"
              )}
            >
              {isHealthyMargin ? (
                <TrendingUp className="h-3.5 w-3.5 text-primary" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-chart-2" />
              )}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
              {t("posCostMargin")}
            </span>
          </div>
          <p
            className={cn(
              "font-mono text-xl font-extrabold text-center w-full",
              isHealthyMargin ? "text-primary" : "text-chart-2"
            )}
          >
            {margin.toFixed(2)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 relative overflow-hidden flex flex-col items-center text-center">
          <div className="absolute top-0 right-0 h-14 w-14 rounded-bl-full bg-chart-3/5" />
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            <div className="rounded-lg bg-chart-3/10 p-1.5">
              <Percent className="h-3.5 w-3.5 text-chart-3" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
              {t("posCostMarginPercent")}
            </span>
          </div>
          <p className="font-mono text-xl font-extrabold text-foreground text-center w-full">
            {marginPercent.toFixed(1)}%
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-3 relative overflow-hidden flex flex-col items-center text-center">
          <div className="absolute top-0 right-0 h-14 w-14 rounded-bl-full bg-chart-2/5" />
          <div className="flex items-center justify-center gap-1.5 mb-1.5">
            <div className="rounded-lg bg-chart-2/10 p-1.5">
              <ChefHat className="h-3.5 w-3.5 text-chart-2" />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
              {t("posCostCostPercent") || "원가율"}
            </span>
          </div>
          <p className="font-mono text-xl font-extrabold text-foreground text-center w-full">
            {costPercent.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <Package className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">{t("posCostBreakdown")}</h3>
        </div>
        <div className="p-5 space-y-3">
          <CostRow
            label={miseIncludedInFood ? t("posCostFoodCostInclMise") : t("posCostFoodCost")}
            value={foodCost}
          />
          <div className="border-t border-border my-2" />
          <CostRow
            label={t("posCostTotalFoodCost")}
            value={totalFoodCost}
            bold
            color="primary"
          />

          {serviceType === "Delivery" && (
            <>
              <div className="border-t border-dashed border-border my-2" />
              <CostRow label={t("posCostDeliveryPackageCost")} value={deliveryPackageCost} />
              <div className="flex items-center justify-between text-sm gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground pl-4 shrink-0">{t("posCostAppFee")}</span>
                  {onDeliveryPercentChange ? (
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={deliveryPercent}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value)
                          if (!Number.isNaN(v) && v >= 0 && v <= 100) {
                            onDeliveryPercentChange(v)
                          } else if (e.target.value === "" || e.target.value === "-") {
                            onDeliveryPercentChange(0)
                          }
                        }}
                        className="h-8 w-16 font-mono text-xs text-right [& input]:text-right"
                      />
                      <span className="text-xs text-muted-foreground">%</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">({deliveryPercent}%)</span>
                  )}
                </div>
                <span className="font-mono text-foreground shrink-0">{deliveryFee.toFixed(2)}</span>
              </div>
            </>
          )}

          <div className="border-t border-border my-2" />

          <div className="flex items-center justify-between rounded-lg bg-secondary/50 px-4 py-3">
            <span className="text-sm font-semibold text-foreground">
              {t("posCostTotalCost")}
            </span>
            <span className="font-mono text-lg font-bold text-primary">
              {totalCost.toFixed(2)} THB
            </span>
          </div>

          {/* Marketing / Margin bar */}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{t("posCostCostShort")}</span>
              <span>{t("posCostMargin")}</span>
            </div>
            <div className="h-3 w-full rounded-full bg-secondary overflow-hidden flex">
              <div
                className="h-full rounded-l-full bg-chart-2 transition-all duration-500"
                style={{ width: `${Math.min(costPercent, 100)}%` }}
              />
              <div
                className="h-full rounded-r-full bg-primary transition-all duration-500"
                style={{ width: `${Math.max(100 - costPercent, 0)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-chart-2">{costPercent.toFixed(1)}%</span>
              <span className="text-primary">{marginPercent.toFixed(1)}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CostRow({
  label,
  value,
  bold,
  indent,
  color,
}: {
  label: string
  value: number
  bold?: boolean
  indent?: boolean
  color?: "primary" | "accent"
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between text-sm",
        indent && "pl-4"
      )}
    >
      <span
        className={cn(
          "text-muted-foreground",
          bold && "font-medium text-foreground"
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "font-mono",
          bold && "font-semibold",
          color === "primary" && "text-primary",
          color === "accent" && "text-accent",
          !color && !bold && "text-foreground"
        )}
      >
        {value.toFixed(2)}
      </span>
    </div>
  )
}
