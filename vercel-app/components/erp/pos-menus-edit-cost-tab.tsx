"use client"

import * as React from "react"
import { TabsContent } from "@/components/ui/tabs"
import {
  isChickenMenu,
  isChickenDefaultOption,
  type PosMenuCostResult,
  type PosMenuFormData,
} from "@/app/admin/pos-menus/pos-menus-page-helpers"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Trash2, Plus } from "lucide-react"
import { Input } from "@/components/ui/input"
import type { PosMenuOption, PosMenuIngredient } from "@/lib/api-client"

export interface PosMenuEditCostTabProps {
  formData: PosMenuFormData
  menuOptions: PosMenuOption[]
  t: (k: string) => string
  selectedIngredientOptionId: string
  setSelectedIngredientOptionId: React.Dispatch<React.SetStateAction<string>>
  optionPartLabel: (name: string) => string
  menuIngredients: PosMenuIngredient[]
  handleDeleteIngredient: (ing: PosMenuIngredient) => Promise<void>
  newIngredientType: "packaging" | "food"
  setNewIngredientType: React.Dispatch<React.SetStateAction<"packaging" | "food">>
  newIngredientCode: string
  setNewIngredientCode: React.Dispatch<React.SetStateAction<string>>
  items: { code: string; name: string; category: string }[]
  newIngredientQty: string
  setNewIngredientQty: React.Dispatch<React.SetStateAction<string>>
  newIngredientLossRate: string
  setNewIngredientLossRate: React.Dispatch<React.SetStateAction<string>>
  handleAddIngredient: () => Promise<void>
  menuCost: PosMenuCostResult | null
  baseMenuCost: number | null
}

export function PosMenuEditCostTab({
  formData,
  menuOptions,
  t,
  selectedIngredientOptionId,
  setSelectedIngredientOptionId,
  optionPartLabel,
  menuIngredients,
  handleDeleteIngredient,
  newIngredientType,
  setNewIngredientType,
  newIngredientCode,
  setNewIngredientCode,
  items,
  newIngredientQty,
  setNewIngredientQty,
  newIngredientLossRate,
  setNewIngredientLossRate,
  handleAddIngredient,
  menuCost,
  baseMenuCost,
}: PosMenuEditCostTabProps) {
  return (
    <TabsContent value="cost" className="mt-4">
      {(isChickenMenu(formData.code) ? menuOptions.some((o) => o.optionType === "substitution" && !isChickenDefaultOption(o.name)) : menuOptions.some((o) => o.optionType === "substitution")) && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">{t("posIngredientScope") || "재료 범위"}</span>
          <Select value={selectedIngredientOptionId || "base"} onValueChange={(v) => setSelectedIngredientOptionId(v === "base" ? "" : v)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="base">{isChickenMenu(formData.code) ? (t("posIngredientScopeBaseChicken") || "기본 (S Boneless)") : (t("posIngredientScopeBase") || "기본 (옵션 없음)")}</SelectItem>
              {(isChickenMenu(formData.code) ? menuOptions.filter((o) => o.optionType === "substitution" && !isChickenDefaultOption(o.name)) : menuOptions.filter((o) => o.optionType === "substitution")).map((o) => (
                <SelectItem key={o.id} value={o.id}>{t("posIngredientScopeOption") || "옵션"}: {optionPartLabel(o.name)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="rounded border border-dashed border-amber-500/50 p-3">
        <h4 className="mb-2 text-xs font-semibold">
          {selectedIngredientOptionId ? `${t("posIngredientScopeOption") || "옵션"}: ${optionPartLabel(menuOptions.find((o) => o.id === selectedIngredientOptionId)?.name ?? "")}` : t("posMenuIngredients") || "재료 (BOM)"}
        </h4>
        <ul className="mb-2 max-h-48 overflow-y-auto space-y-1">
          {menuIngredients.map((ing) => (
            <li key={ing.id} className="flex items-center justify-between rounded bg-amber-500/10 px-2 py-1 text-xs">
              <span>
                {ing.itemCode} × {ing.quantity}{(ing.lossRate ?? 0) > 0 ? ` (로스 ${ing.lossRate}%)` : ""}
                {ing.ingredientType === "packaging" && <span className="ml-1 text-amber-600">[포장]</span>}
              </span>
              <Button size="sm" variant="ghost" className="h-5 px-1 text-destructive hover:text-destructive" onClick={() => handleDeleteIngredient(ing)}><Trash2 className="h-3 w-3" /></Button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Select value={newIngredientType} onValueChange={(v) => setNewIngredientType(v as "food" | "packaging")}>
            <SelectTrigger className="h-8 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="food">{t("posCostTypeFood") || "음식"}</SelectItem>
              <SelectItem value="packaging">{t("posCostTypePackaging") || "포장"}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={newIngredientCode} onValueChange={setNewIngredientCode}>
            <SelectTrigger className="h-8 flex-1 min-w-[120px] text-xs">
              <SelectValue placeholder={t("posIngredientPh") || "재료 선택"} />
            </SelectTrigger>
            <SelectContent>
              {items.map((it) => <SelectItem key={it.code} value={it.code}>{it.code} — {it.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="number" min={0.001} step={0.1} placeholder="1" className="h-8 w-16 text-right text-xs" value={newIngredientQty} onChange={(e) => setNewIngredientQty(e.target.value)} />
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground shrink-0">{t("posIngredientLoss") || "로스"}</span>
            <Input type="number" min={0} max={100} step={0.5} placeholder="0" className="h-8 w-14 text-right text-xs" value={newIngredientLossRate} onChange={(e) => setNewIngredientLossRate(e.target.value)} />
            <span className="text-[10px] text-muted-foreground">%</span>
          </div>
          <Button size="sm" className="h-8 px-2" onClick={handleAddIngredient}><Plus className="h-3.5 w-3.5" /></Button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">{t("posIngredientHint") || "판매 시 해당 재료가 자동 차감됩니다."}</p>
      </div>
      {menuCost != null && menuCost.breakdown.length > 0 && (
        <div className="rounded border bg-muted/30 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left font-semibold">{t("posMenuIngredients") || "재료"}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("quantity") || "수량"}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("posIngredientLoss") || "로스"}</th>
                <th className="px-3 py-2 text-right font-semibold">{t("posMenuCost") || "원가"}</th>
              </tr>
            </thead>
            <tbody>
              {menuCost.breakdown.map((b) => (
                <tr key={b.itemCode} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{b.itemName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{(b.lossRate ?? 0) > 0 ? `${b.lossRate}%` : "-"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{b.costTotal.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex justify-between items-center border-t bg-muted/30 px-3 py-2">
            <span className="text-xs font-semibold">{t("posMenuCost") || "총 원가"}</span>
            <span className="font-bold tabular-nums">{menuCost.cost.toFixed(1)}</span>
          </div>
          {(Number(formData.price) || 0) > 0 && (
            <div className="flex justify-between items-center border-t px-3 py-2">
              <span className="text-xs font-semibold">{t("posMenuCostRatio") || "원가율"}</span>
              <span className="font-bold text-amber-600 tabular-nums">{((menuCost.cost / (Number(formData.price) || 1)) * 100).toFixed(1)}%</span>
            </div>
          )}
        </div>
      )}
      {baseMenuCost != null && (Number(formData.price) || 0) > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <span className="text-xs text-muted-foreground">{t("posMenuCostRatio") || "최종 원가율"}</span>
          <span className="ml-2 text-lg font-bold text-amber-600">
            {((baseMenuCost / (Number(formData.price) || 1)) * 100).toFixed(1)}%
          </span>
        </div>
      )}
    </TabsContent>
  )
}
