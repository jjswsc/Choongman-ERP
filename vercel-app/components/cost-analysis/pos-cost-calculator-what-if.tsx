"use client"

import * as React from "react"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { RecipeItem } from "@/lib/cost-data"
import {
  calculateItemCost,
  calculateSubTotal,
  getIngredient,
  getIngredientItemCode,
} from "@/lib/cost-data"
import {
  costRatioTierClass,
  costRatioTier,
  simulateRecipeLineCostDelta,
} from "@/lib/pos-cost-analysis-shared"
import { toPosCostSalesDenom, type PosCostVatView } from "@/lib/pos-cost-vat"

type Props = {
  foodItems: RecipeItem[]
  packagingItems: RecipeItem[]
  priceHall: number
  priceDelivery: number | null | undefined
  vatIncluded: boolean
  vatView?: PosCostVatView
  deliveryFeePercent: number
  serviceType: "Dine-In" | "Delivery"
}

export function PosCostCalculatorWhatIf({
  foodItems,
  packagingItems,
  priceHall,
  priceDelivery,
  vatIncluded,
  vatView = "excluded",
  deliveryFeePercent: _deliveryFeePercent,
  serviceType,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const [itemCode, setItemCode] = React.useState("")
  const [deltaPct, setDeltaPct] = React.useState(10)

  const ingredientOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    const all = [...foodItems, ...packagingItems]
    for (const item of all) {
      const code = String(getIngredientItemCode(item.ingredientCode) ?? item.savedItemCode ?? "").trim()
      if (!code) continue
      const name = getIngredient(item.ingredientCode)?.name ?? code
      map.set(code, name)
    }
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code, "ko"))
  }, [foodItems, packagingItems])

  React.useEffect(() => {
    if (itemCode && ingredientOptions.some((o) => o.code === itemCode)) return
    setItemCode(ingredientOptions[0]?.code ?? "")
  }, [ingredientOptions, itemCode])

  const lineCosts = React.useMemo(() => {
    const out: Array<{ itemCode: string; lineCost: number }> = []
    for (const item of [...foodItems, ...packagingItems]) {
      const code = String(getIngredientItemCode(item.ingredientCode) ?? item.savedItemCode ?? "").trim()
      if (!code) continue
      out.push({ itemCode: code, lineCost: calculateItemCost(item) })
    }
    return out
  }, [foodItems, packagingItems])

  const baseFood = React.useMemo(() => calculateSubTotal(foodItems), [foodItems])
  const basePack = React.useMemo(() => calculateSubTotal(packagingItems), [packagingItems])
  const baseTotal =
    serviceType === "Delivery" ? baseFood + basePack : baseFood

  const deltaCost = simulateRecipeLineCostDelta(lineCosts, itemCode, deltaPct)
  const afterTotal = baseTotal + deltaCost

  const price = serviceType === "Delivery" ? (priceDelivery ?? priceHall) : priceHall
  const net = toPosCostSalesDenom(price, vatIncluded !== false, vatView)

  const beforeRatio = net > 0 ? (baseTotal / net) * 100 : 0
  const afterRatio = net > 0 ? (afterTotal / net) * 100 : 0
  const beforeMargin = net - baseTotal
  const afterMargin = net - afterTotal

  if (ingredientOptions.length === 0) return null

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold">{t("posCostCalcWhatIfTitle")}</h3>
        <p className="text-[11px] text-muted-foreground mt-0.5">{t("posCostCalcWhatIfHint")}</p>
      </div>
      <div className="p-5 space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t("posCostIngredient")}</Label>
          <Select value={itemCode || "_none"} onValueChange={(v) => setItemCode(v === "_none" ? "" : v)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={t("posCostItemCode")} />
            </SelectTrigger>
            <SelectContent>
              {ingredientOptions.map((o) => (
                <SelectItem key={o.code} value={o.code}>
                  <span className="font-mono">{o.code}</span> — {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">
            {t("posCostWhatIfDelta")}: {deltaPct > 0 ? "+" : ""}
            {deltaPct}%
          </Label>
          <Input
            type="range"
            min={-30}
            max={30}
            step={1}
            value={deltaPct}
            onChange={(e) => setDeltaPct(Number(e.target.value) || 0)}
            className="h-2"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-muted-foreground">{t("posCostRatioHall")}</p>
            <p className={cn("font-mono font-semibold tabular-nums", costRatioTierClass(costRatioTier(beforeRatio)))}>
              {beforeRatio.toFixed(1)}%
            </p>
            <p className="text-muted-foreground text-[10px]">→</p>
            <p className={cn("font-mono font-semibold tabular-nums", costRatioTierClass(costRatioTier(afterRatio)))}>
              {afterRatio.toFixed(1)}%
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 space-y-1">
            <p className="text-muted-foreground">{t("posCostMargin")}</p>
            <p className="font-mono font-semibold tabular-nums">{beforeMargin.toFixed(2)}</p>
            <p className="text-muted-foreground text-[10px]">→</p>
            <p className="font-mono font-semibold tabular-nums">{afterMargin.toFixed(2)}</p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">{t("posCostCalcWhatIfFootnote")}</p>
      </div>
    </div>
  )
}
