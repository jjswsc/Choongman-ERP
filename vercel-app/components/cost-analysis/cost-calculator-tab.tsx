"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calculator, ChefHat, Truck, RotateCcw, Save } from "lucide-react"
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
  setRuntimeIngredients,
  setRuntimeSauces,
  setRuntimeApiItems,
  clearRuntimeIngredients,
  getIngredientItemCode,
  MISE_DEFAULT,
} from "@/lib/cost-data"
import type { MenuItem, RecipeItem } from "@/lib/cost-data"
import type { PosMenuCostAnalysisRow } from "@/lib/api-client"
import { getSauces, getAdminItems, getPosMenuIngredients, savePosMenuIngredient, deletePosMenuIngredient } from "@/lib/api-client"

interface CostCalculatorTabProps {
  initialLoadFromRow?: PosMenuCostAnalysisRow | null
  onClearLoad?: () => void
  onSaveSuccess?: () => void
  /** POS 메뉴 목록 (메뉴 불러오기용) */
  menuRows?: PosMenuCostAnalysisRow[]
  onSelectMenu?: (row: PosMenuCostAnalysisRow) => void
}

function breakdownToRecipeItems(row: PosMenuCostAnalysisRow): { food: RecipeItem[]; packaging: RecipeItem[] } {
  const food: RecipeItem[] = []
  const packaging: RecipeItem[] = []
  const runtimeItems: Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging"; itemCode: string }> = []

  row.breakdown.forEach((b, idx) => {
    const codeNum = parseInt(b.itemCode, 10)
    const code = !isNaN(codeNum) ? codeNum : 10000 + idx
    const cat = b.ingredientType === "packaging" ? "packaging" : "food"
    runtimeItems.push({ code, name: b.itemName, bahtPerUnit: b.costPerUnit, category: cat, itemCode: b.itemCode })
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

export function CostCalculatorTab({ initialLoadFromRow, onClearLoad, onSaveSuccess, menuRows = [], onSelectMenu }: CostCalculatorTabProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [menuItem, setMenuItem] = useState<MenuItem>(sampleMenuItem)
  const [foodItems, setFoodItems] = useState<RecipeItem[]>(sampleFoodRecipe)
  const [packagingItems, setPackagingItems] = useState<RecipeItem[]>(samplePackagingRecipe)

  useEffect(() => {
    getAdminItems().then((items) => setRuntimeApiItems(items)).catch(() => {})
    getSauces().then((list) => setRuntimeSauces(list)).catch(() => {})
  }, [])

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

  const handleReset = useCallback(() => {
    clearRuntimeIngredients()
    onClearLoad?.()
    setMenuItem(sampleMenuItem)
    setFoodItems(sampleFoodRecipe)
    setPackagingItems(samplePackagingRecipe)
  }, [onClearLoad])

  const [saving, setSaving] = useState(false)
  const [menuSelectKey, setMenuSelectKey] = useState("")
  const canSave = !!initialLoadFromRow
  const handleSave = useCallback(async () => {
    if (!initialLoadFromRow || saving) return
    const menuId = Number(initialLoadFromRow.menuId)
    const optionId = initialLoadFromRow.optionId ? Number(initialLoadFromRow.optionId) : null
    if (!menuId) return

    const allItems = [
      ...foodItems.map((r) => ({ ...r, ingredientType: "food" as const })),
      ...packagingItems.map((r) => ({ ...r, ingredientType: "packaging" as const })),
    ]
    const toSave: { itemCode: string; quantity: number; lossRate: number; ingredientType: "food" | "packaging" }[] = []
    for (const r of allItems) {
      const itemCode = getIngredientItemCode(r.ingredientCode)
      if (!itemCode?.trim()) continue
      toSave.push({
        itemCode: itemCode.trim(),
        quantity: r.quantity,
        lossRate: r.misePercent ?? MISE_DEFAULT,
        ingredientType: r.ingredientType,
      })
    }

    setSaving(true)
    try {
      const existing = await getPosMenuIngredients({
        menuId: String(menuId),
        optionId: optionId != null ? String(optionId) : undefined,
      })
      for (const ing of existing) {
        const res = await deletePosMenuIngredient({ id: String(ing.id) })
        if (!res.success) throw new Error(res.message)
      }
      for (const row of toSave) {
        const res = await savePosMenuIngredient({
          menuId,
          optionId,
          itemCode: row.itemCode,
          quantity: row.quantity,
          lossRate: row.lossRate,
          ingredientType: row.ingredientType,
        })
        if (!res.success) throw new Error(res.message)
      }
      alert(t("msg_save_success") || "저장되었습니다.")
      onSaveSuccess?.()
    } catch (e) {
      alert(String(e) || (t("msg_save_fail_detail") || "저장에 실패했습니다."))
    } finally {
      setSaving(false)
    }
  }, [initialLoadFromRow, foodItems, packagingItems, saving, t, onSaveSuccess])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <IngredientSheet />
          {menuRows.length > 0 && onSelectMenu && (
            <Select
              value={menuSelectKey}
              onValueChange={(key) => {
                const row = menuRows.find((r) => (r.optionId ? `${r.menuId}:${r.optionId}` : r.menuId) === key)
                if (row) {
                  onSelectMenu(row)
                  setMenuSelectKey("")
                }
              }}
            >
              <SelectTrigger className="h-8 w-[200px] text-xs">
                <SelectValue placeholder={t("posCostLoadMenu") || "POS 메뉴 불러오기"} />
              </SelectTrigger>
              <SelectContent>
                {menuRows.map((r) => {
                  const key = r.optionId ? `${r.menuId}:${r.optionId}` : r.menuId
                  const label = r.optionName ? `${r.menuName} (${r.optionName})` : r.menuName
                  return (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t("posCostReset")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleSave}
            disabled={!canSave || saving}
            className="gap-1.5 text-xs"
            title={!canSave ? (t("posCostSaveHint") || "목록에서 메뉴를 선택한 후 저장할 수 있습니다.") : undefined}
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? (t("loading") || "저장 중...") : (t("itemsBtnSave") || "저장")}
          </Button>
        </div>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <MenuInfoPanel menuItem={menuItem} onMenuItemChange={setMenuItem} />
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

        <div className="space-y-6 self-start">
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
