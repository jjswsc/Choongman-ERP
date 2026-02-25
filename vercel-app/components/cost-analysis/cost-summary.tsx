"use client"

import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { TrendingUp, TrendingDown, DollarSign, Percent, Package, ChefHat } from "lucide-react"

interface CostSummaryProps {
  foodSubTotal: number
  packagingSubTotal: number
  misePercent: number
  inclVat: number
  serviceType: "Dine-In" | "Delivery"
  deliveryPercent: number
  /** true면 품목별 미세가 이미 foodSubTotal에 포함됨 (메뉴 레벨 미세 미적용) */
  miseIncludedInFood?: boolean
}

export function CostSummary({
  foodSubTotal,
  packagingSubTotal,
  misePercent,
  inclVat,
  serviceType,
  deliveryPercent,
  miseIncludedInFood = false,
}: CostSummaryProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const foodCost = foodSubTotal
  const miseCost = miseIncludedInFood ? 0 : foodSubTotal * (misePercent / 100)
  const totalFoodCost = foodSubTotal + miseCost
  const deliveryPackageCost = packagingSubTotal
  const totalCost =
    serviceType === "Delivery"
      ? totalFoodCost + deliveryPackageCost
      : totalFoodCost

  const exclVat = inclVat / 1.07
  const deliveryFee = serviceType === "Delivery" ? inclVat * (deliveryPercent / 100) : 0
  const exclAppFee = serviceType === "Delivery" ? exclVat - deliveryFee : exclVat
  const margin = exclAppFee - totalCost
  const marginPercent = exclAppFee > 0 ? (margin / exclAppFee) * 100 : 0
  const costPercent = exclAppFee > 0 ? (totalCost / exclAppFee) * 100 : 0

  const isHealthyMargin = marginPercent >= 60

  return (
    <div className="space-y-4">
      {/* Main Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 h-16 w-16 rounded-bl-full bg-primary/5" />
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-lg bg-primary/10 p-1.5">
              <DollarSign className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("posCostInclVat")}
            </span>
          </div>
          <p className="font-mono text-xl font-bold text-foreground">
            {inclVat.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {t("posCostExclVat")}: {exclVat.toFixed(2)}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 h-16 w-16 rounded-bl-full bg-chart-2/5" />
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-lg bg-chart-2/10 p-1.5">
              <ChefHat className="h-3.5 w-3.5 text-chart-2" />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("posCostTotalCost")}
            </span>
          </div>
          <p className="font-mono text-xl font-bold text-foreground">
            {totalCost.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {t("posCostCostPercent")}: {costPercent.toFixed(1)}%
          </p>
        </div>

        <div
          className={cn(
            "rounded-xl border p-4 relative overflow-hidden",
            isHealthyMargin
              ? "border-primary/30 bg-primary/5"
              : "border-chart-2/30 bg-chart-2/5"
          )}
        >
          <div
            className={cn(
              "absolute top-0 right-0 h-16 w-16 rounded-bl-full",
              isHealthyMargin ? "bg-primary/10" : "bg-chart-2/10"
            )}
          />
          <div className="flex items-center gap-2 mb-2">
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
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("posCostMargin")}
            </span>
          </div>
          <p
            className={cn(
              "font-mono text-xl font-bold",
              isHealthyMargin ? "text-primary" : "text-chart-2"
            )}
          >
            {margin.toFixed(2)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {marginPercent.toFixed(1)}% {t("posCostOfRevenue")}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 h-16 w-16 rounded-bl-full bg-chart-3/5" />
          <div className="flex items-center gap-2 mb-2">
            <div className="rounded-lg bg-chart-3/10 p-1.5">
              <Percent className="h-3.5 w-3.5 text-chart-3" />
            </div>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t("posCostMarginPercent")}
            </span>
          </div>
          <p className="font-mono text-xl font-bold text-foreground">
            {marginPercent.toFixed(1)}%
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {t("posCostCostShort")}: {costPercent.toFixed(1)}%
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
          {!miseIncludedInFood && misePercent > 0 && (
            <CostRow
              label={`${t("posCostMiseEnPlace")} (${misePercent}%)`}
              value={miseCost}
              indent
            />
          )}
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
              <CostRow
                label={`${t("posCostAppFee")} (${deliveryPercent}%)`}
                value={deliveryFee}
                indent
              />
            </>
          )}

          {!miseIncludedInFood && (
            <>
              <div className="border-t border-border my-2" />
              <CostRow label={t("posCostSubTotal")} value={foodCost} />
              <CostRow label={`${t("posCostMiseEnPlace")} (${misePercent}%)`} value={miseCost} indent />
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
