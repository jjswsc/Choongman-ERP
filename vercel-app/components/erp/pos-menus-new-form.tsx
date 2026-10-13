"use client"

import * as React from "react"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ChevronDown, Save, RotateCcw } from "lucide-react"
import {
  supportsPosMenuAutoCode,
  type PosMenuFormData,
} from "@/app/admin/pos-menus/pos-menus-page-helpers"
import { getNextPosMenuCode } from "@/lib/api-client"
import { posMenuCodePlaceholderForMain } from "@/lib/pos-menu-next-code"
import { translatePosMenuCategoryLabel } from "@/lib/pos-menu-category-label"

export interface PosMenuNewFormProps {
  t: (k: string) => string
  categoryMainOpen: boolean
  setCategoryMainOpen: React.Dispatch<React.SetStateAction<boolean>>
  formData: PosMenuFormData
  setFormData: React.Dispatch<React.SetStateAction<PosMenuFormData>>
  mainCategories: string[]
  categoryOpen: boolean
  setCategoryOpen: React.Dispatch<React.SetStateAction<boolean>>
  categoriesByMain: string[]
  renderMenuStoreScopePicker: (hintKey: string, keyPrefix: string) => React.JSX.Element
  handleSave: () => Promise<void>
  handleReset: () => void
}

export function PosMenuNewForm({
  t,
  categoryMainOpen,
  setCategoryMainOpen,
  formData,
  setFormData,
  mainCategories,
  categoryOpen,
  setCategoryOpen,
  categoriesByMain,
  renderMenuStoreScopePicker,
  handleSave,
  handleReset,
}: PosMenuNewFormProps) {
  return (
    <>
      <div>
        <label className="text-xs font-semibold">{t("posMenuCategoryMain")}</label>
        <DropdownMenu open={categoryMainOpen} onOpenChange={setCategoryMainOpen}>
          <div className="flex h-10 rounded-md border border-input bg-background overflow-hidden mt-1">
            <Input
              placeholder={t("posMenuCategoryMain")}
              className="h-10 flex-1 rounded-r-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={formData.categoryMain}
              onChange={(e) => setFormData((p) => ({ ...p, categoryMain: e.target.value, category: "" }))}
              onFocus={() => setCategoryMainOpen(true)}
            />
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-l-none border-l">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent align="start" className="max-h-60 min-w-[200px]">
            {mainCategories.map((c) => (
              <DropdownMenuItem
                key={c}
                onClick={async () => {
                  setFormData((p) => ({ ...p, categoryMain: c, category: "" }))
                  setCategoryMainOpen(false)
                  if (supportsPosMenuAutoCode(c)) {
                    const { code: next } = await getNextPosMenuCode(c)
                    if (next) setFormData((p) => ({ ...p, categoryMain: c, category: "", code: next }))
                  }
                }}
              >
                {c}
              </DropdownMenuItem>
            ))}
            {formData.categoryMain.trim() &&
              !mainCategories.some((m) => m.toLowerCase() === formData.categoryMain.trim().toLowerCase()) && (
              <DropdownMenuItem
                onClick={async () => {
                  const trimmed = formData.categoryMain.trim()
                  setFormData((p) => ({ ...p, categoryMain: trimmed }))
                  setCategoryMainOpen(false)
                  if (supportsPosMenuAutoCode(trimmed)) {
                    const { code: next } = await getNextPosMenuCode(trimmed)
                    if (next) setFormData((p) => ({ ...p, categoryMain: trimmed, code: next }))
                  }
                }}
                className="text-primary font-medium"
              >
                + {t("itemsCategoryNew") || "신규 대분류"}: {formData.categoryMain.trim()}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div>
        <label className="text-xs font-semibold">{t("posMenuCode")}</label>
        <Input
          placeholder={posMenuCodePlaceholderForMain(formData.categoryMain)}
          className="mt-1 h-10"
          value={formData.code}
          onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))}
          disabled={
            supportsPosMenuAutoCode(formData.categoryMain) && !!formData.code.trim()
          }
          title={
            supportsPosMenuAutoCode(formData.categoryMain)
              ? (t("posMenuCodeAuto") || "대분류 선택 시 자동 생성")
              : undefined
          }
        />
      </div>
      <div>
        <label className="text-xs font-semibold">{t("posMenuName")}</label>
        <Input placeholder={t("itemsNamePh")} className="mt-1 h-10" value={formData.name} onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))} />
      </div>
      <div>
        <label className="text-xs font-semibold">{t("posMenuCategory")}</label>
        <DropdownMenu open={categoryOpen} onOpenChange={setCategoryOpen}>
          <div className="flex h-10 rounded-md border border-input bg-background overflow-hidden mt-1">
            <Input
              placeholder={t("itemsCategoryPh")}
              className="h-10 flex-1 rounded-r-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={formData.category}
              onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
              onFocus={() => setCategoryOpen(true)}
            />
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-10 w-10 shrink-0 rounded-l-none border-l">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </div>
          <DropdownMenuContent align="start" className="max-h-60 min-w-[200px]">
            {categoriesByMain.map((c) => (
              <DropdownMenuItem
                key={c}
                onClick={() => {
                  setFormData((p) => ({ ...p, category: c }))
                  setCategoryOpen(false)
                }}
              >
                {translatePosMenuCategoryLabel(c, t)}
              </DropdownMenuItem>
            ))}
            {formData.category.trim() &&
              !categoriesByMain.some((c) => c.toLowerCase() === formData.category.trim().toLowerCase()) && (
              <DropdownMenuItem
                onClick={() => {
                  setFormData((p) => ({ ...p, category: formData.category.trim() }))
                  setCategoryOpen(false)
                }}
                className="text-primary font-medium"
              >
                + {t("itemsCategoryNew") || "신규 카테고리"}: {formData.category.trim()}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {renderMenuStoreScopePicker("posMenuVisibleStoresRequiredToSave", "scope-new")}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold">{t("posMenuPriceHall")}</label>
          <Input type="number" placeholder="0" className="mt-1 h-10 text-right" value={formData.price} onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))} />
        </div>
        <div>
          <label className="text-xs font-semibold">{t("posMenuPriceDelivery")}</label>
          <Input type="number" placeholder={t("posMenuSameAsHallPlaceholder")} className="mt-1 h-10 text-right" value={formData.priceDelivery} onChange={(e) => setFormData((p) => ({ ...p, priceDelivery: e.target.value }))} />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={formData.sellHall} onChange={(e) => setFormData((p) => ({ ...p, sellHall: e.target.checked }))} />
          {t("posOptionSellHall") || "홀"}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={formData.sellDelivery} onChange={(e) => setFormData((p) => ({ ...p, sellDelivery: e.target.checked }))} />
          {t("posOptionSellDelivery") || "배달"}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={formData.sellPackaging} onChange={(e) => setFormData((p) => ({ ...p, sellPackaging: e.target.checked }))} />
          {t("posOptionSellPackaging") || "포장"}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={formData.sellMember} onChange={(e) => setFormData((p) => ({ ...p, sellMember: e.target.checked }))} />
          {t("posOptionSellMember") || "회원"}
        </label>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={formData.vatIncluded} onChange={(e) => setFormData((p) => ({ ...p, vatIncluded: e.target.checked }))} />
          {t("posMenuVatIncluded")}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))} />
          {t("posMenuActive")}
        </label>
      </div>
      <div className="flex gap-3 pt-2">
        <Button className="flex-1" onClick={handleSave}><Save className="mr-2 h-4 w-4" />{t("itemsBtnSave")}</Button>
        <Button variant="outline" onClick={handleReset}><RotateCcw className="mr-2 h-4 w-4" />{t("itemsBtnReset")}</Button>
      </div>
    </>
  )
}
