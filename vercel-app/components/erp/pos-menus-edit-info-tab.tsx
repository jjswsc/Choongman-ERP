"use client"

import * as React from "react"
import { TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { ChevronDown } from "lucide-react"
import { translatePosMenuCategoryLabel } from "@/lib/pos-menu-category-label"
import { appAlert } from "@/lib/app-message"
import { Checkbox } from "@/components/ui/checkbox"
import {
  isChickenMenu,
  isChickenDefaultOption,
  POS_MENUS_EDIT_RESUME_KEY,
  type PosMenuFormData,
  type PosMenuFormTab,
  type PosMenusMainTab,
} from "@/app/admin/pos-menus/pos-menus-page-helpers"
import type { PosMenu, PosMenuOption } from "@/lib/api-client"

export interface PosMenuEditInfoTabProps {
  t: (k: string) => string
  formData: PosMenuFormData
  setFormData: React.Dispatch<React.SetStateAction<PosMenuFormData>>
  isPromoLinkedMenuEdit: boolean
  categoryMainOpen: boolean
  setCategoryMainOpen: React.Dispatch<React.SetStateAction<boolean>>
  mainCategories: string[]
  categoryOpen: boolean
  setCategoryOpen: React.Dispatch<React.SetStateAction<boolean>>
  categoriesByMain: string[]
  renderMenuStoreScopePicker: (hintKey: string, keyPrefix: string) => React.JSX.Element
  banbanFlavorAutoMenus: PosMenu[]
  banbanFlavorSelectableMenus: PosMenu[]
  banbanSelectedMenuIdSet: Set<string>
  menuOptions: PosMenuOption[]
  optionPartLabel: (name: string) => string
  setFormTab: React.Dispatch<React.SetStateAction<PosMenuFormTab>>
  setMainTab: React.Dispatch<React.SetStateAction<PosMenusMainTab>>
  setOptionsConfigSelectedMenuId: React.Dispatch<React.SetStateAction<string | null>>
  editingId: string
  baseMenuCost: number | null
  selectedStoreCodes: string[]
}

export function PosMenuEditInfoTab({
  t,
  formData,
  setFormData,
  isPromoLinkedMenuEdit,
  categoryMainOpen,
  setCategoryMainOpen,
  mainCategories,
  categoryOpen,
  setCategoryOpen,
  categoriesByMain,
  renderMenuStoreScopePicker,
  banbanFlavorAutoMenus,
  banbanFlavorSelectableMenus,
  banbanSelectedMenuIdSet,
  menuOptions,
  optionPartLabel,
  setFormTab,
  setMainTab,
  setOptionsConfigSelectedMenuId,
  editingId,
  baseMenuCost,
  selectedStoreCodes,
}: PosMenuEditInfoTabProps) {
  return (
    <TabsContent value="info" className="space-y-4 mt-4">
      <div>
        <label className="text-xs font-semibold">{t("posMenuCode")}</label>
        <Input placeholder="M001" className="mt-1 h-10" value={formData.code} onChange={(e) => setFormData((p) => ({ ...p, code: e.target.value }))} disabled />
      </div>
      <div>
        <label className="text-xs font-semibold">{t("posMenuName")}</label>
        <Input
          placeholder={t("itemsNamePh")}
          className="mt-1 h-10"
          value={formData.name}
          onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
          disabled={isPromoLinkedMenuEdit}
        />
      </div>
      <div>
        <label className="text-xs font-semibold">{t("posMenuCategoryMain")}</label>
        <DropdownMenu open={categoryMainOpen} onOpenChange={setCategoryMainOpen}>
          <div className="flex h-10 rounded-md border border-input bg-background overflow-hidden mt-1">
            <Input
              placeholder={t("posMenuCategoryMain")}
              className="h-10 flex-1 rounded-r-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={formData.categoryMain}
              onChange={(e) => setFormData((p) => ({ ...p, categoryMain: e.target.value }))}
              onFocus={() => setCategoryMainOpen(true)}
              disabled={isPromoLinkedMenuEdit}
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
                onClick={() => {
                  setFormData((p) => ({ ...p, categoryMain: c, category: "" }))
                  setCategoryMainOpen(false)
                }}
              >
                {c}
              </DropdownMenuItem>
            ))}
            {formData.categoryMain.trim() &&
              !mainCategories.some((c) => c.toLowerCase() === formData.categoryMain.trim().toLowerCase()) && (
              <DropdownMenuItem
                onClick={() => {
                  setFormData((p) => ({ ...p, categoryMain: formData.categoryMain.trim() }))
                  setCategoryMainOpen(false)
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
        <label className="text-xs font-semibold">{t("posMenuCategory")}</label>
        <DropdownMenu open={categoryOpen} onOpenChange={setCategoryOpen}>
          <div className="flex h-10 rounded-md border border-input bg-background overflow-hidden mt-1">
            <Input
              placeholder={t("itemsCategoryPh")}
              className="h-10 flex-1 rounded-r-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={formData.category}
              onChange={(e) => setFormData((p) => ({ ...p, category: e.target.value }))}
              onFocus={() => setCategoryOpen(true)}
              disabled={isPromoLinkedMenuEdit}
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
      {renderMenuStoreScopePicker("posMenuVisibleStoresScopeHint", "scope-edit")}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold">{t("posMenuPriceHall")}</label>
          <Input type="number" placeholder="0" className="mt-1 h-10 text-right" value={formData.price} onChange={(e) => setFormData((p) => ({ ...p, price: e.target.value }))} disabled={isPromoLinkedMenuEdit} />
        </div>
        <div>
          <label className="text-xs font-semibold">{t("posMenuPriceDelivery")}</label>
          <Input type="number" placeholder={t("posMenuSameAsHallPlaceholder")} className="mt-1 h-10 text-right" value={formData.priceDelivery} onChange={(e) => setFormData((p) => ({ ...p, priceDelivery: e.target.value }))} disabled={isPromoLinkedMenuEdit} />
        </div>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={formData.sellHall}
            onChange={(e) => setFormData((p) => ({ ...p, sellHall: e.target.checked }))}
            disabled={isPromoLinkedMenuEdit}
          />
          {t("posOptionSellHall") || "홀"}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={formData.sellDelivery}
            onChange={(e) => setFormData((p) => ({ ...p, sellDelivery: e.target.checked }))}
            disabled={isPromoLinkedMenuEdit}
          />
          {t("posOptionSellDelivery") || "배달"}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={formData.sellPackaging}
            onChange={(e) => setFormData((p) => ({ ...p, sellPackaging: e.target.checked }))}
            disabled={isPromoLinkedMenuEdit}
          />
          {t("posOptionSellPackaging") || "포장"}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={formData.sellMember}
            onChange={(e) => setFormData((p) => ({ ...p, sellMember: e.target.checked }))}
            disabled={isPromoLinkedMenuEdit}
          />
          {t("posOptionSellMember") || "회원"}
        </label>
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={formData.vatIncluded} onChange={(e) => setFormData((p) => ({ ...p, vatIncluded: e.target.checked }))} disabled={isPromoLinkedMenuEdit} />
          {t("posMenuVatIncluded")}
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={formData.isActive} onChange={(e) => setFormData((p) => ({ ...p, isActive: e.target.checked }))} disabled={isPromoLinkedMenuEdit} />
          {t("posMenuActive")}
        </label>
        <label className="flex items-center gap-2 text-xs" title={t("posMenuBanbanHint") || "POS에서 다른 치킨(S Boneless) 2개를 골라 한 상으로 주문. 원가는 각 0.5씩."}>
          <input type="checkbox" checked={formData.isBanban} onChange={(e) => setFormData((p) => ({ ...p, isBanban: e.target.checked }))} disabled={isPromoLinkedMenuEdit} />
          {t("posMenuBanban") || "반반 메뉴 (맛 2개 선택)"}
        </label>
        <label
          className="flex items-center gap-2 text-xs"
          title={
            t("posMenuBuffetIncludableHint") ||
            "QR 뷔페 티어에서 포함(0원) 후보로 고를 수 있습니다. 실제 포함은 QR 테이블오더 티어에서 체크합니다."
          }
        >
          <input
            type="checkbox"
            checked={formData.buffetIncludable}
            onChange={(e) => setFormData((p) => ({ ...p, buffetIncludable: e.target.checked }))}
            disabled={isPromoLinkedMenuEdit}
          />
          {t("posMenuBuffetIncludable") || "뷔페 포함 가능 (QR)"}
        </label>
      </div>
      {formData.isBanban && (
        <div className="rounded border border-dashed border-sky-300 bg-sky-50/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-semibold text-sky-800">
                {t("posMenuBanbanFlavorWhitelistTitle") || "반반 허용 맛"}
              </h4>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("posMenuBanbanFlavorWhitelistHint") || "이 반반 메뉴에서 보여줄 맛만 직접 선택합니다. 비워 두면 기존 자동 후보 규칙을 사용합니다."}
              </p>
            </div>
            <span className="rounded bg-white px-2 py-1 text-[11px] text-muted-foreground">
              {(t("posMenuBanbanFlavorSelectedCount") || "{count} selected").replace(
                "{count}",
                String(formData.banbanFlavorMenuIds.length)
              )}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              disabled={isPromoLinkedMenuEdit}
              onClick={async () => {
                const nextIds = banbanFlavorAutoMenus
                  .map((menu) => String(menu.id || "").trim())
                  .filter(Boolean)
                if (nextIds.length === 0) {
                  await appAlert("반반 기본 후보로 넣을 치킨 메뉴가 없습니다.")
                  return
                }
                setFormData((p) => ({ ...p, banbanFlavorMenuIds: nextIds }))
              }}
            >
              {t("posMenuBanbanFlavorLoadDefaults") || "치킨 기본값 불러오기"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              disabled={isPromoLinkedMenuEdit || formData.banbanFlavorMenuIds.length === 0}
              onClick={() => setFormData((p) => ({ ...p, banbanFlavorMenuIds: [] }))}
            >
              {t("posMenuBanbanFlavorClearAll") || "전체 해제"}
            </Button>
          </div>
          {banbanFlavorSelectableMenus.length > 0 ? (
            <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-md border border-border/40 bg-background/70 p-2">
              {banbanFlavorSelectableMenus.map((menu) => {
                const id = String(menu.id || "").trim()
                const checked = banbanSelectedMenuIdSet.has(id)
                const label = `${menu.code ? `[${menu.code}] ` : ""}${menu.name}`
                return (
                  <div key={id} className="flex items-start gap-2 py-1">
                    <Checkbox
                      id={`banban-flavor-${id}`}
                      checked={checked}
                      disabled={isPromoLinkedMenuEdit}
                      onCheckedChange={(nextChecked) => {
                        setFormData((prev) => ({
                          ...prev,
                          banbanFlavorMenuIds: nextChecked === true
                            ? Array.from(new Set([...prev.banbanFlavorMenuIds, id]))
                            : prev.banbanFlavorMenuIds.filter((x) => String(x || "").trim() !== id),
                        }))
                      }}
                    />
                    <label htmlFor={`banban-flavor-${id}`} className="min-w-0 cursor-pointer text-xs leading-tight">
                      <span className="block truncate">{label}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {String(menu.categoryMain ?? "").trim() || "-"} / {String(menu.category ?? "").trim() || "-"}
                      </span>
                    </label>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              선택할 치킨 후보가 없습니다. 카테고리/활성 상태를 확인해 주세요.
            </p>
          )}
        </div>
      )}
      <div className="rounded border border-dashed border-primary/30 bg-muted/20 p-3">
        <h4 className="text-xs font-semibold text-muted-foreground">{t("posMenuOptions") || "옵션"}</h4>
        {(() => {
          const optsToShow = isChickenMenu(formData.code) ? menuOptions.filter((o) => !isChickenDefaultOption(o.name)) : menuOptions
          return optsToShow.length > 0 ? (
          <ul className="mt-2 space-y-1 max-h-28 overflow-y-auto">
            {optsToShow.map((o) => (
              <li key={o.id} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1 text-xs">
                <span>{optionPartLabel(o.name)}</span>
                <span className="text-muted-foreground tabular-nums">
                  {(o.priceModifier ?? 0) !== 0 ? `+${o.priceModifier}` : "-"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">{t("posMenuOptionsSelectHint") || "옵션 구성 탭에서 사이즈, 부위를 추가해 주세요."}</p>
        )
        })()}
        <Button variant="outline" size="sm" className="mt-2 text-xs" onClick={() => { setFormTab("options"); setMainTab("optionsConfig"); setOptionsConfigSelectedMenuId(editingId); }}>{t("posMenuTabOptionsConfig") || "옵션 구성"}</Button>
      </div>
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="text-xs text-muted-foreground">{t("posMenuCostRatio") || "최종 원가율"}</span>
            <span className="ml-2 text-lg font-bold text-amber-600">
              {baseMenuCost != null && (Number(formData.price) || 0) > 0
                ? `${((baseMenuCost / (Number(formData.price) || 1)) * 100).toFixed(1)}%`
                : "-"}
            </span>
          </div>
          {editingId && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-xs"
              onClick={() => {
                try {
                  sessionStorage.setItem(
                    POS_MENUS_EDIT_RESUME_KEY,
                    JSON.stringify({
                      editingId,
                      selectedStoreCodes,
                    })
                  )
                } catch {
                  /* ignore */
                }
                const qs = new URLSearchParams({
                  menuId: editingId,
                  menuCode: formData.code || "",
                })
                window.location.href = `/admin/pos-cost-analysis?${qs.toString()}`
              }}
            >
              {t("posMenuCostAnalysisShortcut") || "원가 분석 바로가기"}
            </Button>
          )}
        </div>
      </div>
    </TabsContent>
  )
}
