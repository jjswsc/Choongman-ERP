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
import { FlaskConical, Plus, Pencil, Trash2, RefreshCw, Settings } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getSauces, saveSauce, deleteSauce, recalculateSauces, getCostSettings, updateCostSettings, getAdminItems, type SauceRow } from "@/lib/api-client"

export function SauceCostTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const [sauces, setSauces] = React.useState<SauceRow[]>([])
  const [items, setItems] = React.useState<{ code: string; name: string }[]>([])
  const [loading, setLoading] = React.useState(true)
  const [recalcLoading, setRecalcLoading] = React.useState(false)
  const [overheadPercent, setOverheadPercent] = React.useState(5)
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [editOpen, setEditOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<SauceRow | null>(null)
  const [formCode, setFormCode] = React.useState("")
  const [formName, setFormName] = React.useState("")
  const [formUnit, setFormUnit] = React.useState("g")
  const [formOh, setFormOh] = React.useState(5)
  const [formIngredients, setFormIngredients] = React.useState<{ itemCode: string; quantity: number; lossRate: number }[]>([])
  const [addIngOpen, setAddIngOpen] = React.useState(false)
  const [newIngCode, setNewIngCode] = React.useState("")
  const [newIngQty, setNewIngQty] = React.useState("")
  const [newIngLoss, setNewIngLoss] = React.useState("")

  const load = React.useCallback(async () => {
    try {
      const [sauceList, itemList, settings] = await Promise.all([
        getSauces(),
        getAdminItems(),
        getCostSettings(),
      ])
      setSauces(sauceList || [])
      setItems((itemList || []).map((i) => ({ code: i.code, name: i.name })))
      setOverheadPercent(settings?.globalOverheadPercent ?? 5)
    } catch {
      setSauces([])
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

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
    try {
      await updateCostSettings({ globalOverheadPercent: overheadPercent })
      setSettingsOpen(false)
    } catch (e) {
      alert(String(e))
    }
  }

  const handleNew = () => {
    setEditing(null)
    setFormCode("")
    setFormName("")
    setFormUnit("g")
    setFormOh(overheadPercent)
    setFormIngredients([])
    setEditOpen(true)
  }

  const handleEdit = (s: SauceRow) => {
    setEditing(s)
    setFormCode(s.code)
    setFormName(s.name)
    setFormUnit(s.unit || "g")
    setFormOh(s.overheadPercent)
    setFormIngredients(s.ingredients.map((i) => ({ itemCode: i.itemCode, quantity: i.quantity, lossRate: i.lossRate || 0 })))
    setEditOpen(true)
  }

  const handleSave = async () => {
    const code = formCode.trim()
    const name = formName.trim()
    if (!code || !name) {
      alert(t("posCostSauceCodeNameRequired") || "코드와 소스명이 필요합니다.")
      return
    }
    try {
      await saveSauce({
        id: editing?.id,
        code,
        name,
        unit: formUnit,
        overheadPercent: formOh,
        ingredients: formIngredients,
      })
      setEditOpen(false)
      await load()
    } catch (e) {
      alert(String(e))
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

  const handleAddIngredient = () => {
    const code = newIngCode.trim()
    const qty = parseFloat(newIngQty) || 0
    if (!code || qty <= 0) return
    setFormIngredients((prev) => [...prev, { itemCode: code, quantity: qty, lossRate: parseFloat(newIngLoss) || 0 }])
    setNewIngCode("")
    setNewIngQty("")
    setNewIngLoss("")
    setAddIngOpen(false)
  }

  const handleRemoveIngredient = (idx: number) => {
    setFormIngredients((prev) => prev.filter((_, i) => i !== idx))
  }

  const availableCodes = React.useMemo(() => {
    const codes = new Set(items.map((i) => i.code))
    sauces.forEach((s) => codes.add(s.code))
    return Array.from(codes)
  }, [items, sauces])

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
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-20">{t("posMenuCode")}</TableHead>
                <TableHead>{t("posCostName")}</TableHead>
                <TableHead className="text-right">{t("posCostSauceCostPerUnit") || "단가"}</TableHead>
                <TableHead className="text-right">{t("posCostSauceTotalCost") || "총원가"}</TableHead>
                <TableHead className="text-right">{t("posCostSauceOh") || "OH%"}</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sauces.map((s) => (
                <TableRow key={s.id ?? s.code} className="border-b">
                  <TableCell className="font-mono text-xs">{s.code}</TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
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

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
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
              value={overheadPercent}
              onChange={(e) => setOverheadPercent(Number(e.target.value) || 0)}
            />
          </div>
          <DialogFooter>
            <Button onClick={handleSaveSettings}>{t("save") || "저장"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? (t("posCostSauceEdit") || "소스 수정") : (t("posCostSauceNew") || "소스 추가")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium">{t("posMenuCode")}</label>
                <Input value={formCode} onChange={(e) => setFormCode(e.target.value)} placeholder="S001" className="mt-1" disabled={!!editing} />
              </div>
              <div>
                <label className="text-xs font-medium">{t("posCostName")}</label>
                <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Snow Onion Sauce" className="mt-1" />
              </div>
              <div>
                <label className="text-xs font-medium">{t("posCostUnit") || "단위"}</label>
                <Select value={formUnit} onValueChange={setFormUnit}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium">{t("posCostSauceOh") || "OH %"}</label>
                <Input type="number" min={0} max={50} step={0.5} value={formOh} onChange={(e) => setFormOh(Number(e.target.value) || 0)} className="mt-1" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium">{t("posCostSauceIngredients") || "재료"}</label>
                <Button variant="outline" size="sm" onClick={() => setAddIngOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" />
                  {t("posCostSauceAddIng") || "재료 추가"}
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead>{t("posMenuCode")}</TableHead>
                    <TableHead>{t("posCostName")}</TableHead>
                    <TableHead className="text-right">{t("posCostQty")}</TableHead>
                    <TableHead className="text-right">{t("posIngredientLoss")}</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formIngredients.map((ing, idx) => {
                    const item = items.find((i) => i.code === ing.itemCode) || sauces.find((s) => s.code === ing.itemCode)
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-mono text-xs">{ing.itemCode}</TableCell>
                        <TableCell>{item?.name ?? ing.itemCode}</TableCell>
                        <TableCell className="text-right">{ing.quantity}</TableCell>
                        <TableCell className="text-right">{ing.lossRate > 0 ? `${ing.lossRate}%` : "-"}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleRemoveIngredient(idx)}>
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {formIngredients.length === 0 && (
                <div className="py-4 text-center text-sm text-muted-foreground">{t("posCostSauceNoIngredients") || "재료를 추가하세요"}</div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleSave}>{t("save") || "저장"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addIngOpen} onOpenChange={setAddIngOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("posCostSauceAddIng") || "재료 추가"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium">{t("posMenuCode")}</label>
              <Select value={newIngCode} onValueChange={setNewIngCode}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t("posCostSauceSelectIng") || "품목/소스 선택"} />
                </SelectTrigger>
                <SelectContent>
                  {availableCodes.map((code) => {
                    const item = items.find((i) => i.code === code) || sauces.find((s) => s.code === code)
                    return (
                      <SelectItem key={code} value={code}>
                        {code} - {item?.name ?? code}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium">{t("posCostQty")}</label>
              <Input type="number" min={0} step={0.01} value={newIngQty} onChange={(e) => setNewIngQty(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-medium">{t("posIngredientLoss")}</label>
              <Input type="number" min={0} max={100} step={0.5} value={newIngLoss} onChange={(e) => setNewIngLoss(e.target.value)} placeholder="0" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddIngOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={handleAddIngredient}>{t("add") || "추가"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
