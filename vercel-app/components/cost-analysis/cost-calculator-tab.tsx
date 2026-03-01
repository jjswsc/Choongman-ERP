"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { RotateCcw, Save } from "lucide-react"
import { MenuInfoPanel } from "@/components/cost-analysis/menu-info-panel"
import { IngredientTable } from "@/components/cost-analysis/ingredient-table"
import { CostSummary } from "@/components/cost-analysis/cost-summary"
import { CostChart } from "@/components/cost-analysis/cost-chart"
import {
  emptyMenuItem,
  emptyFoodRecipe,
  emptyPackagingRecipe,
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
import { POS_MAIN_CATEGORIES, POS_CATEGORIES_BY_MAIN } from "@/lib/pos-menu-categories"
import { getSauces, getAdminItems, getPosMenuIngredients, savePosMenuIngredient, deletePosMenuIngredient } from "@/lib/api-client"

interface CostCalculatorTabProps {
  initialLoadFromRow?: PosMenuCostAnalysisRow | null
  onClearLoad?: () => void
  onSaveSuccess?: () => void
  /** POS 메뉴 목록 (카테고리 목록 추출·검색용) */
  menuRows?: PosMenuCostAnalysisRow[]
  /** 메뉴 검색에서 선택 시 (목록 로드) */
  onMenuSelect?: (row: PosMenuCostAnalysisRow) => void
}

function breakdownToRecipeItems(row: PosMenuCostAnalysisRow): { food: RecipeItem[]; packaging: RecipeItem[] } {
  const food: RecipeItem[] = []
  const packaging: RecipeItem[] = []
  const runtimeItems: Array<{ code: number; name: string; bahtPerUnit: number; category: "food" | "packaging"; itemCode: string }> = []

  const breakdown = Array.isArray(row.breakdown) ? row.breakdown : []
  breakdown.forEach((b, idx) => {
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

export function CostCalculatorTab({ initialLoadFromRow, onClearLoad, onSaveSuccess, menuRows = [], onMenuSelect }: CostCalculatorTabProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [menuItem, setMenuItem] = useState<MenuItem>(emptyMenuItem)
  const [foodItems, setFoodItems] = useState<RecipeItem[]>(emptyFoodRecipe)
  const [packagingItems, setPackagingItems] = useState<RecipeItem[]>(emptyPackagingRecipe)

  useEffect(() => {
    getAdminItems().then((items) => setRuntimeApiItems(items)).catch(() => {})
    getSauces().then((list) => setRuntimeSauces(list)).catch(() => {})
  }, [])

  useEffect(() => {
    const row = initialLoadFromRow && typeof initialLoadFromRow === "object" && !Array.isArray(initialLoadFromRow) && initialLoadFromRow.menuId != null
      ? { ...initialLoadFromRow, breakdown: Array.isArray(initialLoadFromRow.breakdown) ? initialLoadFromRow.breakdown : [] }
      : null
    if (row) {
      const { food, packaging } = breakdownToRecipeItems(row)
      const price = row.priceDelivery ?? row.priceHall
      const rowWithCode = row as PosMenuCostAnalysisRow & { displayCode?: string }
      setMenuItem({
        ...emptyMenuItem,
        menuCode: rowWithCode.displayCode ?? row.menuCode ?? "",
        menuName: (row.menuName ?? "") + (row.optionName ? ` (${row.optionName})` : ""),
        category: row.category ?? "",
        categoryMain: row.categoryMain ?? "",
        inclVat: price,
      })
      setFoodItems(food)
      setPackagingItems(packaging)
    } else {
      clearRuntimeIngredients()
      setMenuItem(emptyMenuItem)
      setFoodItems(emptyFoodRecipe)
      setPackagingItems(emptyPackagingRecipe)
    }
    return () => clearRuntimeIngredients()
  }, [initialLoadFromRow])

  const foodSubTotal = useMemo(() => calculateSubTotal(foodItems), [foodItems])
  const packagingSubTotal = useMemo(() => calculateSubTotal(packagingItems), [packagingItems])

  const categoriesFromMenus = useMemo(() => {
    const set = new Set(menuRows.map((r) => r.category).filter(Boolean))
    return Array.from(set).sort()
  }, [menuRows])

  const mainCategoriesFromMenus = useMemo(() => {
    const fromRows = new Set(
      menuRows.map((r) => r.categoryMain).filter((c): c is string => typeof c === "string" && c !== "")
    )
    return Array.from(new Set([...POS_MAIN_CATEGORIES, ...fromRows]))
      .filter((c): c is string => typeof c === "string")
      .sort()
  }, [menuRows])

  const categoriesFromMenusByMain = useMemo(() => {
    return (mainCat: string) => {
      if (mainCat && mainCat in POS_CATEGORIES_BY_MAIN) {
        const preset = POS_CATEGORIES_BY_MAIN[mainCat as keyof typeof POS_CATEGORIES_BY_MAIN]
        const fromRows = menuRows.filter((r) => (r.categoryMain ?? "") === mainCat).map((r) => r.category).filter(Boolean)
        return Array.from(new Set([...preset, ...fromRows])).sort()
      }
      return categoriesFromMenus
    }
  }, [menuRows, categoriesFromMenus])

  const handleReset = useCallback(() => {
    clearRuntimeIngredients()
    onClearLoad?.()
    setMenuItem(emptyMenuItem)
    setFoodItems(emptyFoodRecipe)
    setPackagingItems(emptyPackagingRecipe)
  }, [onClearLoad])

  const [saving, setSaving] = useState(false)
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <MenuInfoPanel
            menuItem={menuItem}
            onMenuItemChange={setMenuItem}
            categories={menuItem.categoryMain ? categoriesFromMenusByMain(menuItem.categoryMain) : categoriesFromMenus}
            mainCategories={mainCategoriesFromMenus}
            menuRows={menuRows}
            onMenuSelect={onMenuSelect}
            onRequestChangeMenu={onClearLoad}
            readOnlyMenuInfo={!!initialLoadFromRow}
          />
          <div className="space-y-6">
            <IngredientTable title={t("posCostFoodIngredients")} type="food" items={foodItems} onItemsChange={setFoodItems} />
            {menuItem.serviceType === "Delivery" && (
              <IngredientTable
                title={t("posCostPackagingDelivery")}
                type="packaging"
                items={packagingItems}
                onItemsChange={setPackagingItems}
              />
            )}
          </div>
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
