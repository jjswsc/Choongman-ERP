"use client"

import * as React from "react"
import { TabsContent } from "@/components/ui/tabs"
import {
  isChickenMenu,
  isChickenDefaultOption,
  additiveOptionLinkSuffix,
  type PosMenuFormData,
} from "@/app/admin/pos-menus/pos-menus-page-helpers"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import type { PosMenuOption, PosMenu } from "@/lib/api-client"

export interface PosMenuEditOptionsTabProps {
  t: (k: string) => string
  formData: PosMenuFormData
  menuOptions: PosMenuOption[]
  optionPartLabel: (name: string) => string
  menus: PosMenu[]
  newOptionName: string
  setNewOptionName: React.Dispatch<React.SetStateAction<string>>
  handleAddOption: () => Promise<void>
  newOptionType: "substitution" | "additive"
  setNewOptionType: React.Dispatch<React.SetStateAction<"substitution" | "additive">>
  currentMenuGroups: string[]
  newOptionStepValues: Record<string, string>
  setNewOptionStepValues: React.Dispatch<React.SetStateAction<Record<string, string>>>
  newOptionSourceMenuId: string
  setNewOptionSourceMenuId: React.Dispatch<React.SetStateAction<string>>
  additiveMenusForOptions: PosMenu[]
  newOptionQuantity: string
  setNewOptionQuantity: React.Dispatch<React.SetStateAction<string>>
  newOptionChannelScope: "all" | "hall" | "delivery" | "packaging"
  setNewOptionChannelScope: React.Dispatch<React.SetStateAction<"all" | "hall" | "delivery" | "packaging">>
  newOptionModifier: string
  setNewOptionModifier: React.Dispatch<React.SetStateAction<string>>
  newOptionModifierDelivery: string
  setNewOptionModifierDelivery: React.Dispatch<React.SetStateAction<string>>
}

export function PosMenuEditOptionsTab({
  t,
  formData,
  menuOptions,
  optionPartLabel,
  menus,
  newOptionName,
  setNewOptionName,
  handleAddOption,
  newOptionType,
  setNewOptionType,
  currentMenuGroups,
  newOptionStepValues,
  setNewOptionStepValues,
  newOptionSourceMenuId,
  setNewOptionSourceMenuId,
  additiveMenusForOptions,
  newOptionQuantity,
  setNewOptionQuantity,
  newOptionChannelScope,
  setNewOptionChannelScope,
  newOptionModifier,
  setNewOptionModifier,
  newOptionModifierDelivery,
  setNewOptionModifierDelivery,
}: PosMenuEditOptionsTabProps) {
  return (
    <TabsContent value="options" className="mt-4">
      <div className="rounded border border-dashed p-3">
        <h4 className="mb-2 text-xs font-semibold">{t("posMenuOptions") || "옵션 (반반, 뼈/순살 등)"}</h4>
        <ul className="mb-2 space-y-1">
          {(isChickenMenu(formData.code) ? menuOptions.filter((o) => !isChickenDefaultOption(o.name)) : menuOptions).map((o) => (
            <li key={o.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs">
              <span>
                <span className={o.optionType === "additive" ? "text-amber-600" : ""}>{optionPartLabel(o.name)}</span>
                {o.optionType === "additive" && additiveOptionLinkSuffix(o, menus) && (
                  <span className="ml-1 text-muted-foreground">+{additiveOptionLinkSuffix(o, menus)}</span>
                )}
                {o.optionType === "substitution" && o.optionStepValues && Object.keys(o.optionStepValues).length > 0 && (
                  <span className="ml-1 text-muted-foreground">({Object.entries(o.optionStepValues).map(([k, v]) => `${k}:${v}`).join(" / ")})</span>
                )}
                {(o.priceModifier ?? 0) !== 0 || (o.priceModifierDelivery ?? o.priceModifier ?? 0) !== 0
                  ? ` (홀 ${(o.priceModifier ?? 0) >= 0 ? "+" : ""}${o.priceModifier ?? 0} / 배달 ${(o.priceModifierDelivery ?? o.priceModifier ?? 0) >= 0 ? "+" : ""}${o.priceModifierDelivery ?? o.priceModifier ?? 0})` : ""}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input placeholder={t("posOptionNamePh") || "옵션명"} className="h-8 text-xs flex-1" value={newOptionName} onChange={(e) => setNewOptionName(e.target.value)} />
            <Button size="sm" className="h-8 px-2 shrink-0" onClick={handleAddOption}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-[10px] text-muted-foreground shrink-0">{t("posOptionType") || "타입"}</span>
            <Select value={newOptionType} onValueChange={(v) => setNewOptionType(v as "substitution" | "additive")}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="substitution">{t("posOptionTypeSubstitution") || "대체형"}</SelectItem>
                <SelectItem value="additive">{t("posOptionTypeAdditive") || "추가형"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {newOptionType === "substitution" && currentMenuGroups.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {currentMenuGroups.map((g) => (
                <div key={g} className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">{g}</span>
                  <Input
                    placeholder={g}
                    className="h-8 w-24 text-xs"
                    value={newOptionStepValues[g] ?? ""}
                    onChange={(e) => setNewOptionStepValues((p) => ({ ...p, [g]: e.target.value }))}
                  />
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground w-full">예: size=M, part=Boneless</p>
            </div>
          )}
          {newOptionType === "additive" && (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2 items-center flex-wrap">
                <Select value={newOptionSourceMenuId} onValueChange={setNewOptionSourceMenuId}>
                  <SelectTrigger className="h-8 flex-1 min-w-[120px] text-xs">
                    <SelectValue placeholder={t("posOptionAdditiveMenu") || "연결 메뉴"} />
                  </SelectTrigger>
                  <SelectContent>
                    {additiveMenusForOptions.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.code} — {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="number" min={0.001} step={0.1} placeholder="1" className="h-8 w-16 text-right text-xs" value={newOptionQuantity} onChange={(e) => setNewOptionQuantity(e.target.value)} />
              </div>
              <p className="text-[10px] text-muted-foreground">
                {t("posAdditiveOptionMenuHint") ||
                  "추가형은 별도 등록한 POS 메뉴(메뉴코드)를 연결합니다. 해당 메뉴의 기본 재료(BOM)가 옵션 수량 배수만큼 원가·재고에 가산됩니다."}
              </p>
            </div>
          )}
          <div className="flex gap-2 text-xs">
            <span className="shrink-0 py-2 text-muted-foreground w-16">{t("posChannel") || "채널"}</span>
            <Select value={newOptionChannelScope} onValueChange={(v) => setNewOptionChannelScope(v as "all" | "hall" | "delivery" | "packaging")}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("all") || "전체"}</SelectItem>
                <SelectItem value="hall">{t("posOptionSellHall") || "홀"}</SelectItem>
                <SelectItem value="delivery">{t("posOptionSellDelivery") || "배달"}</SelectItem>
                <SelectItem value="packaging">{t("posOptionSellPackaging") || "포장"}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="shrink-0 py-2 text-muted-foreground w-16">{t("posOptionModifierHall")}</span>
            <Input type="number" placeholder="+0" className="h-8 w-20 text-right text-xs" value={newOptionModifier} onChange={(e) => setNewOptionModifier(e.target.value)} />
            <span className="shrink-0 py-2 text-muted-foreground w-20">{t("posOptionModifierDelivery")}</span>
            <Input type="number" placeholder={t("posMenuSameAsHallPlaceholder")} className="h-8 w-20 text-right text-xs" value={newOptionModifierDelivery} onChange={(e) => setNewOptionModifierDelivery(e.target.value)} />
          </div>
        </div>
      </div>
    </TabsContent>
  )
}
