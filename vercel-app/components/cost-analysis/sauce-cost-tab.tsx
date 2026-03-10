"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Plus, Pencil, Trash2, RefreshCw, Settings } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getSauces, saveSauce, deleteSauce, recalculateSauces, getCostSettings, updateCostSettings, getAdminItems, type SauceRow, type AdminItem } from "@/lib/api-client"
import { setRuntimeApiItems, setRuntimeSauces, getIngredientCodeByItemCode, getIngredientItemCode, MISE_DEFAULT } from "@/lib/cost-data"
import type { RecipeItem } from "@/lib/cost-data"
import { IngredientTable } from "@/components/cost-analysis/ingredient-table"

export function SauceCostTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const [sauces, setSauces] = React.useState<SauceRow[]>([])
  const [items, setItems] = React.useState<AdminItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [recalcLoading, setRecalcLoading] = React.useState(false)
  const [saveLoading, setSaveLoading] = React.useState(false)
  const [settingsLoading, setSettingsLoading] = React.useState(false)
  const [overheadPercent, setOverheadPercent] = React.useState(5)
  const [overheadPercentStr, setOverheadPercentStr] = React.useState("5")
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<SauceRow | null>(null)
  const [formCode, setFormCode] = React.useState("")
  const [formName, setFormName] = React.useState("")
  const [formUnit, setFormUnit] = React.useState("g")
  const [formOh, setFormOh] = React.useState(5)
  const [formOhStr, setFormOhStr] = React.useState("5")
  const [formTotalQuantity, setFormTotalQuantity] = React.useState<number>(0)
  const [formFoodItems, setFormFoodItems] = React.useState<RecipeItem[]>([])

  const load = React.useCallback(async () => {
    setLoadError(null)
    try {
      const [sauceList, itemList, settings] = await Promise.all([
        getSauces(),
        getAdminItems(),
        getCostSettings(),
      ])
      setSauces(sauceList || [])
      setItems(itemList || [])
      const oh = settings?.globalOverheadPercent ?? 5
      setOverheadPercent(oh)
      setOverheadPercentStr(String(oh))
    } catch (e) {
      setSauces([])
      setItems([])
      setLoadError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const getNextSauceCode = React.useCallback((list: SauceRow[]) => {
    const match = /^S(\d+)$/i
    let max = 0
    for (const s of list) {
      const m = String(s.code ?? "").match(match)
      if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return `S${String(max + 1).padStart(3, "0")}`
  }, [])

  const handleRecalculate = async () => {
    setRecalcLoading(true)
    try {
      await recalculateSauces()
      await load()
    } finally {
      setRecalcLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    const ohNum = parseFloat(overheadPercentStr)
    const val = !isNaN(ohNum) && ohNum >= 0 && ohNum <= 50 ? ohNum : 5
    setSettingsLoading(true)
    try {
      await updateCostSettings({ globalOverheadPercent: val })
      setOverheadPercent(val)
      setOverheadPercentStr(String(val))
      setSettingsOpen(false)
    } catch (e) {
      alert(String(e))
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleNew = () => {
    setEditing(null)
    setFormCode(getNextSauceCode(sauces))
    setFormName("")
    setFormUnit("g")
    setFormOh(overheadPercent)
    setFormOhStr(String(overheadPercent))
    setFormTotalQuantity(0)
    setFormFoodItems([])
    setRuntimeApiItems(items)
    setRuntimeSauces(sauces)
    setEditOpen(true)
  }

  const handleEdit = (s: SauceRow) => {
    setEditing(s)
    setFormCode(s.code)
    setFormName(s.name)
    setFormUnit(s.unit || "g")
    setFormOh(s.overheadPercent)
    setFormOhStr(String(s.overheadPercent))
    setFormTotalQuantity(s.totalQuantity ?? s.ingredients.reduce((sum, i) => sum + i.quantity, 0))
    setRuntimeApiItems(items)
    setRuntimeSauces(sauces.filter((sa) => sa.code !== s.code))
    const foodItems = s.ingredients
      .map((i): RecipeItem | null => {
        const code = getIngredientCodeByItemCode(i.itemCode)
        if (code == null) return null
        return { ingredientCode: code, quantity: i.quantity, misePercent: i.lossRate ?? MISE_DEFAULT }
      })
      .filter((x): x is RecipeItem => x != null)
    setFormFoodItems(foodItems)
    setEditOpen(true)
  }

  const handleSave = async () => {
    const code = formCode.trim()
    const name = formName.trim()
    if (!code || !name) {
      alert(t("posCostSauceCodeNameRequired") || "코드와 소스명이 필요합니다.")
      return
    }
    const ingredients = formFoodItems.map((r) => {
      const itemCode = getIngredientItemCode(r.ingredientCode)
      return { itemCode: itemCode ?? "", quantity: r.quantity, lossRate: r.misePercent ?? MISE_DEFAULT }
    }).filter((i) => i.itemCode.trim())
    const ohNum = parseFloat(formOhStr)
    const overheadVal = !isNaN(ohNum) && ohNum >= 0 && ohNum <= 50 ? ohNum : 5
    setSaveLoading(true)
    try {
      await saveSauce({
        id: editing?.id,
        code,
        name,
        unit: formUnit,
        overheadPercent: overheadVal,
        totalQuantity: formTotalQuantity >= 0 ? formTotalQuantity : undefined,
        ingredients,
      })
      await recalculateSauces()
      setEditOpen(false)
      await load()
    } catch (e) {
      alert(String(e))
    } finally {
      setSaveLoading(false)
    }
  }

  const handleDelete = async (s: SauceRow) => {
    if (!s.id) return
    if (!confirm(t("posCostSauceConfirmDelete") || `"${s.name}" 소스를 삭제할까요?`)) return
    try {
      await deleteSauce({ id: s.id })
      await load()
    } catch (e) {
      alert(String(e))
    }
  }

  const excludeCodes = React.useMemo(() => new Set(formFoodItems.map((i) => i.ingredientCode)), [formFoodItems])

  const handleFoodItemsChange = React.useCallback((items: RecipeItem[]) => {
    setFormFoodItems(items)
    const sum = Math.round(items.reduce((s, i) => s + i.quantity, 0) * 100) / 100
    setFormTotalQuantity(sum)
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" className="h-9" onClick={() => setSettingsOpen(true)}>
          <Settings className="h-3.5 w-3.5 mr-1.5" />
          {t("posCostSauceOhSetting") || "OH 설정"}
        </Button>
        <Button variant="outline" size="sm" className="h-9" onClick={handleRecalculate} disabled={recalcLoading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${recalcLoading ? "animate-spin" : ""}`} />
          {t("posCostSauceRecalc") || "전체 재계산"}
        </Button>
        <Button size="sm" className="h-9" onClick={handleNew}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {t("posCostSauceNew") || "소스 추가"}
        </Button>
      </div>

      {loading ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("loading")}
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-8 text-center">
          <p className="text-sm text-destructive font-medium mb-2">{t("loadError") || "데이터를 불러오지 못했습니다."}</p>
          <p className="text-xs text-muted-foreground mb-3">{loadError}</p>
          <Button variant="outline" size="sm" onClick={load}>{t("retry") || "다시 시도"}</Button>
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-20 text-center">{t("posMenuCode")}</TableHead>
                <TableHead className="text-center">{t("posCostName")}</TableHead>
                <TableHead className="text-center">{t("posCostSauceTotalCapacity") || "총용량"} (g)</TableHead>
                <TableHead className="text-center">{t("posCostSauceCostPerUnit") || "단가"}</TableHead>
                <TableHead className="text-center">{t("posCostSauceTotalCost") || "총원가"}</TableHead>
                <TableHead className="text-center">{t("posCostSauceOh") || "OH%"}</TableHead>
                <TableHead className="w-24 text-center"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sauces.map((s) => (
                <TableRow key={s.id ?? s.code} className="border-b">
                  <TableCell className="font-mono text-xs text-center">{s.code}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-center tabular-nums">{s.totalQuantity ?? "-"}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.costPerUnit.toFixed(4)} ฿/{s.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.totalWithOverhead.toFixed(1)} ฿</TableCell>
                  <TableCell className="text-right tabular-nums">{s.overheadPercent}%</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleEdit(s)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => handleDelete(s)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {sauces.length === 0 && (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              {t("posCostSauceEmpty") || "등록된 소스가 없습니다. 소스 추가를 눌러 원재료로 소스 레시피를 등록하세요."}
            </div>
          )}
        </div>
      )}

      <Dialog open={settingsOpen} onOpenChange={(open) => {
        setSettingsOpen(open)
        if (open) setOverheadPercentStr(String(overheadPercent))
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("posCostSauceOhSetting") || "OH (오버헤드) 설정"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("posCostSauceDefaultOh") || "기본 OH %"}</label>
            <Input
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={overheadPercentStr}
              onChange={(e) => setOverheadPercentStr(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button onClick={handleSaveSettings} disabled={settingsLoading}>{settingsLoading ? (t("loading") || "저장 중...") : (t("save") || "저장")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? (t("posCostSauceEdit") || "소스 수정") : (t("posCostSauceNew") || "소스 추가")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-3 rounded-xl border border-border bg-muted/20">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">{t("posMenuCode")}</label>
                <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="" className="h-8 text-sm bg-secondary/50" disabled readOnly />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">{t("posCostName")}</label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="" className="h-8 text-sm bg-secondary/50" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">{t("posCostUnit") || "단위"}</label>
                <Select value={formUnit} onValueChange={setFormUnit}>
                  <SelectTrigger className="h-8 text-sm bg-secondary/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">{t("posCostSauceOh") || "OH %"}</label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step={0.5}
                  value={formOhStr}
                  onChange={(e) => setFormOhStr(e.target.value)}
                  onBlur={() => {
                    const n = parseFloat(formOhStr)
                    if (!isNaN(n) && n >= 0 && n <= 50) setFormOh(n)
                    else setFormOhStr(String(formOh))
                  }}
                  className="h-8 text-sm bg-secondary/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">{t("posCostSauceTotalCapacity") || "총 용량"} (g)</label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={formTotalQuantity}
                  onChange={(e) => setFormTotalQuantity(parseFloat(e.target.value) || 0)}
                  className="h-8 text-sm bg-secondary/50 font-mono"
                />
              </div>
            </div>
            <IngredientTable
              title={t("posCostSauceIngredients") || "재료"}
              type="food"
              items={formFoodItems}
              onItemsChange={handleFoodItemsChange}
              addDialogIncludeSauces
              addDialogRequireStandardUnits={false}
              excludeCodes={excludeCodes}
              costTextDark
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saveLoading}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave} disabled={saveLoading}>{saveLoading ? (t("loading") || "저장 중...") : (t("save") || "저장")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
