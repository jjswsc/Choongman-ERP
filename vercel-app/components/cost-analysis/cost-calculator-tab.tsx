"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calculator, ChefHat, Truck, RotateCcw } from "lucide-react"
import { MenuInfoPanel } from "@/components/cost-analysis/menu-info-panel"
import { IngredientTable } from "@/components/cost-analysis/ingredient-table"
import { CostSummary } from "@/components/cost-analysis/cost-summary"
import { CostChart } from "@/components/cost-analysis/cost-chart"
import { IngredientSheet } from "@/components/cost-analysis/ingredient-sheet"
import {
  sampleMenuItem,
  sampleFoodRecipe,
  samplePackagingRecipe,
  calculateSubTotal,
  calculateExclVat,
  setRuntimeIngredients,
  clearRuntimeIngredients,
  MISE_DEFAULT,
} from "@/lib/cost-data"
import type { MenuItem, RecipeItem } from "@/lib/cost-data"
import type { PosMenuCostAnalysisRow } from "@/lib/api-client"

interface CostCalculatorTabProps {
  initialLoadFromRow?: PosMenuCostAnalysisRow | null
  onClearLoad?: () => void
}

function breakdownToRecipeItems(row: PosMenuCostAnalysisRow): { food: RecipeItem[]; packaging: RecipeItem[] } {
  const food: RecipeItem[] = []
  const packaging: RecipeItem[] = []
  const runtimeItems: Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging" }> = []

  row.breakdown.forEach((b, idx) => {
    const codeNum = parseInt(b.itemCode, 10)
    const code = !isNaN(codeNum) ? codeNum : 10000 + idx
    const cat = b.ingredientType === "packaging" ? "packaging" : "food"
    runtimeItems.push({ code, name: b.itemName, bahtPerUnit: b.costPerUnit, category: cat })
    const item: RecipeItem = {
      ingredientCode: code,
      quantity: b.quantity,
      misePercent: (b.lossRate ?? 0) || MISE_DEFAULT,
    }
    if (cat === "packaging") packaging.push(item)
    else food.push(item)
  })

  setRuntimeIngredients(runtimeItems)
  return { food, packaging }
}

export function CostCalculatorTab({ initialLoadFromRow, onClearLoad }: CostCalculatorTabProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [menuItem, setMenuItem] = useState<MenuItem>(sampleMenuItem)
  const [foodItems, setFoodItems] = useState<RecipeItem[]>(sampleFoodRecipe)
  const [packagingItems, setPackagingItems] = useState<RecipeItem[]>(samplePackagingRecipe)

  useEffect(() => {
    if (initialLoadFromRow) {
      const { food, packaging } = breakdownToRecipeItems(initialLoadFromRow)
      const price = initialLoadFromRow.priceDelivery ?? initialLoadFromRow.priceHall
      setMenuItem({
        ...sampleMenuItem,
        menuName: initialLoadFromRow.menuName + (initialLoadFromRow.optionName ? ` (${initialLoadFromRow.optionName})` : ""),
        category: initialLoadFromRow.category,
        inclVat: price,
      })
      setFoodItems(food)
      setPackagingItems(packaging)
    } else {
      clearRuntimeIngredients()
    }
    return () => clearRuntimeIngredients()
  }, [initialLoadFromRow])

  const foodSubTotal = useMemo(() => calculateSubTotal(foodItems), [foodItems])
  const packagingSubTotal = useMemo(() => calculateSubTotal(packagingItems), [packagingItems])

  const totalFoodCost = foodSubTotal
  const totalCost =
    menuItem.serviceType === "Delivery"
      ? totalFoodCost + packagingSubTotal
      : totalFoodCost
  const exclVat = calculateExclVat(menuItem.inclVat)
  const margin = exclVat - totalCost
  const marginPercent = exclVat > 0 ? (margin / exclVat) * 100 : 0

  const handleReset = useCallback(() => {
    clearRuntimeIngredients()
    onClearLoad?.()
    setMenuItem(sampleMenuItem)
    setFoodItems(sampleFoodRecipe)
    setPackagingItems(samplePackagingRecipe)
  }, [onClearLoad])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <IngredientSheet />
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("posCostReset")}
          </Button>
        </div>
        <div className="flex items-center gap-3 overflow-x-auto">
          <QuickStat label={t("posCostFood")} value={`${foodSubTotal.toFixed(2)}`} color="primary" />
          <QuickStat label={t("posCostPkg")} value={`${packagingSubTotal.toFixed(2)}`} color="accent" />
          <QuickStat label={t("posCostTotal")} value={`${totalCost.toFixed(2)}`} color="default" />
          <QuickStat
            label={t("posCostMargin")}
            value={`${marginPercent.toFixed(1)}%`}
            color={marginPercent >= 60 ? "primary" : "warning"}
          />
          <Badge
            variant="outline"
            className="border-border font-mono text-xs text-muted-foreground flex-shrink-0"
          >
            {menuItem.serviceType === "Delivery" ? (
              <Truck className="mr-1.5 h-3 w-3" />
            ) : (
              <ChefHat className="mr-1.5 h-3 w-3" />
            )}
            {menuItem.serviceType === "Delivery" ? t("posCostDelivery") : t("posCostDineIn")}
          </Badge>
        </div>
      </div>

      <MenuInfoPanel menuItem={menuItem} onMenuItemChange={setMenuItem} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Tabs defaultValue="dine-in" className="space-y-4">
            <TabsList className="bg-secondary border border-border">
              <TabsTrigger value="dine-in" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <ChefHat className="mr-1.5 h-3.5 w-3.5" />
                {t("posCostDineIn")}
              </TabsTrigger>
              <TabsTrigger value="delivery" className="data-[state=active]:bg-accent/10 data-[state=active]:text-accent">
                <Truck className="mr-1.5 h-3.5 w-3.5" />
                {t("posCostDelivery")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dine-in" className="space-y-6">
              <IngredientTable title={t("posCostFoodIngredients")} type="food" items={foodItems} onItemsChange={setFoodItems} />
            </TabsContent>

            <TabsContent value="delivery" className="space-y-6">
              <IngredientTable title={t("posCostFoodIngredients")} type="food" items={foodItems} onItemsChange={setFoodItems} />
              <IngredientTable
                title={t("posCostPackagingDelivery")}
                type="packaging"
                items={packagingItems}
                onItemsChange={setPackagingItems}
              />
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <CostSummary
            foodSubTotal={foodSubTotal}
            packagingSubTotal={packagingSubTotal}
            misePercent={menuItem.misePercent}
            inclVat={menuItem.inclVat}
            serviceType={menuItem.serviceType}
            deliveryPercent={menuItem.deliveryPercent}
            miseIncludedInFood
          />
          <CostChart
            foodItems={foodItems}
            packagingItems={packagingItems}
            misePercent={0}
          />
        </div>
      </div>
    </div>
  )
}

function QuickStat({
  label,
  value,
  color,
}: {
  label: string
  value: string
  color: "primary" | "accent" | "default" | "warning"
}) {
  const colorClasses = {
    primary: "bg-primary/10 text-primary border-primary/20",
    accent: "bg-accent/10 text-accent border-accent/20",
    default: "bg-secondary text-foreground border-border",
    warning: "bg-chart-2/10 text-chart-2 border-chart-2/20",
  }

  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 flex-shrink-0 ${colorClasses[color]}`}
    >
      <span className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</span>
      <span className="font-mono text-sm font-semibold">{value}</span>
    </div>
  )
}
