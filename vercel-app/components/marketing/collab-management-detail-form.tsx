"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { getPosMenuCategoriesConfig, getPosMenus, type PosMenu } from "@/lib/api-client"
import type { MarketingCollabDetail } from "@/lib/marketing-collab-detail"
import { collabHasPosDiscount } from "@/lib/pos-collab-discount"
import { Loader2, Save } from "lucide-react"

type Basics = {
  topic: string
  campaignNo?: string
  startDate?: string | null
  endDate?: string | null
  branches: string[]
  discountType?: string
  discountValue?: number
  discountTargetAudience?: string
  discountPricePromotion?: string
}

type TFn = (key: string) => string

function scopeCheckbox(
  id: string,
  label: string,
  checked: boolean,
  onChecked: (v: boolean) => void
) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(x) => onChecked(x === true)} />
      <label htmlFor={id} className="cursor-pointer text-sm leading-none">
        {label}
      </label>
    </div>
  )
}

function categoryScopeKey(main: string, category: string): string {
  return `${String(main ?? "").trim()}::${String(category ?? "").trim()}`
}

function toggleListValue(list: string[], value: string, checked: boolean): string[] {
  const v = String(value ?? "").trim()
  if (!v) return list
  const set = new Set(list.map((x) => String(x ?? "").trim()).filter(Boolean))
  if (checked) set.add(v)
  else set.delete(v)
  return Array.from(set)
}

export function CollabManagementDetailForm(props: {
  t: TFn
  basics: Basics
  allStoresLabel: string
  draft: MarketingCollabDetail
  onChange: (next: MarketingCollabDetail) => void
  onSave: () => void
  saving: boolean
  loading: boolean
}) {
  const { t, basics, allStoresLabel, draft, onChange, onSave, saving, loading } = props
  const [mainCategories, setMainCategories] = React.useState<string[]>([])
  const [categoriesByMain, setCategoriesByMain] = React.useState<Record<string, string[]>>({})
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [scopeCatalogLoading, setScopeCatalogLoading] = React.useState(false)
  const [menuSearch, setMenuSearch] = React.useState("")

  const set = React.useCallback(
    (patch: Partial<MarketingCollabDetail>) => {
      onChange({ ...draft, ...patch })
    },
    [draft, onChange]
  )
  const tr = React.useCallback(
    (key: string, fallback: string) => {
      const value = t(key)
      return value && value !== key ? value : fallback
    },
    [t]
  )
  const selectedMainSet = React.useMemo(
    () => new Set((draft.scopeMainCategories || []).map((x) => String(x).trim()).filter(Boolean)),
    [draft.scopeMainCategories]
  )
  const selectedCategoryKeySet = React.useMemo(
    () => new Set((draft.scopeCategoryKeys || []).map((x) => String(x).trim()).filter(Boolean)),
    [draft.scopeCategoryKeys]
  )
  const selectedMenuIdSet = React.useMemo(
    () => new Set((draft.scopeMenuIds || []).map((x) => String(x).trim()).filter(Boolean)),
    [draft.scopeMenuIds]
  )
  const selectedScopeMainCategories = draft.scopeMainCategories || []
  const selectedScopeCategoryKeys = draft.scopeCategoryKeys || []
  const selectedScopeMenuIds = draft.scopeMenuIds || []
  const dynamicScopeCount =
    selectedScopeMainCategories.length + selectedScopeCategoryKeys.length + selectedScopeMenuIds.length
  const visibleMenuRows = React.useMemo(() => {
    const keyword = menuSearch.trim().toLowerCase()
    const activeMains = selectedMainSet
    return menus
      .filter((m) => {
        const main = String(m.categoryMain ?? "").trim()
        const cat = String(m.category ?? "").trim()
        const key = categoryScopeKey(main, cat)
        if (activeMains.size > 0 && !activeMains.has(main) && !selectedCategoryKeySet.has(key)) return false
        if (!keyword) return true
        return `${m.code ?? ""} ${m.name ?? ""} ${main} ${cat}`.toLowerCase().includes(keyword)
      })
      .slice(0, 80)
  }, [menuSearch, menus, selectedCategoryKeySet, selectedMainSet])

  React.useEffect(() => {
    let cancelled = false
    setScopeCatalogLoading(true)
    Promise.all([getPosMenuCategoriesConfig().catch(() => null), getPosMenus().catch(() => [])])
      .then(([cfg, menuRows]) => {
        if (cancelled) return
        const mainsFromCfg = Array.isArray(cfg?.mainCategories) ? cfg.mainCategories : []
        const menuList = Array.isArray(menuRows) ? menuRows : []
        const derivedMains = Array.from(
          new Set(menuList.map((m) => String(m.categoryMain ?? "").trim()).filter(Boolean))
        )
        setMainCategories(mainsFromCfg.length > 0 ? mainsFromCfg : derivedMains)
        setCategoriesByMain(cfg?.categoriesByMain || {})
        setMenus(menuList.filter((m) => m.isActive !== false))
      })
      .finally(() => {
        if (!cancelled) setScopeCatalogLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (mainCategories.length <= 0 || dynamicScopeCount > 0) return
    const legacyRules: [boolean, string[]][] = [
      [draft.scopeChicken, ["chicken", "치킨", "ไก่"]],
      [draft.scopeKorean, ["korean", "한식", "เกาหลี"]],
      [draft.scopeSide, ["side", "사이드", "เครื่องเคียง"]],
      [draft.scopeDrinksNonAlcohol, ["drink", "drinks", "음료", "น้ำ"]],
      [draft.scopeAlcohol, ["alcohol", "beer", "맥주", "เบียร์"]],
      [draft.scopeTopping, ["topping", "토핑", "sauce", "소스"]],
    ]
    const nextMains = new Set<string>()
    for (const [enabled, needles] of legacyRules) {
      if (!enabled) continue
      const hit = mainCategories.find((main) => {
        const s = String(main).toLowerCase()
        return needles.some((needle) => s.includes(needle.toLowerCase()))
      })
      if (hit) nextMains.add(hit)
    }
    if (nextMains.size > 0) set({ scopeMainCategories: Array.from(nextMains) })
  }, [
    draft.scopeAlcohol,
    draft.scopeChicken,
    draft.scopeDrinksNonAlcohol,
    draft.scopeKorean,
    draft.scopeSide,
    draft.scopeTopping,
    dynamicScopeCount,
    mainCategories,
    set,
  ])

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/80 bg-muted/20 px-4 py-3">
        <p className="text-xs font-semibold text-foreground">{t("marketingCollabDetailSectionCampaignBasics")}</p>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsTopic")}</span>
            <p className="font-medium leading-tight">{basics.topic || "—"}</p>
          </div>
          {basics.campaignNo ? (
            <div>
              <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsNo")}</span>
              <p className="font-mono text-sm">{basics.campaignNo}</p>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsPeriod")}</span>
            <p>
              {basics.startDate || "—"} ~ {basics.endDate || "—"}
            </p>
          </div>
          <div className="sm:col-span-2">
            <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsBranches")}</span>
            <p>
              {basics.branches.length > 0 ? basics.branches.join(", ") : allStoresLabel}
            </p>
          </div>
          {collabHasPosDiscount(draft) && (
            <div>
              <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsPosDiscount")}</span>
              <p>
                {draft.posDiscountType === "amount"
                  ? `฿${Number(draft.posDiscountValue).toLocaleString()}${
                      draft.posAllowQuantityEntry !== false && (draft.posMaxPerOrder ?? 1) > 1
                        ? ` · ${t("marketingCollabDetailPosMaxPerOrder")} ${draft.posMaxPerOrder ?? 10}`
                        : ""
                    }`
                  : `${draft.posDiscountValue}%`}
              </p>
            </div>
          )}
          {(basics.discountValue ?? 0) > 0 && (
            <div>
              <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsPlannedDiscount")}</span>
              <p>
                {basics.discountType === "amount" || basics.discountType === "fixed"
                  ? `฿${Number(basics.discountValue).toLocaleString()}`
                  : `${basics.discountValue}%`}
              </p>
            </div>
          )}
          {(basics.discountTargetAudience ?? "").trim() ? (
            <div className="sm:col-span-2">
              <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsAudience")}</span>
              <p className="whitespace-pre-wrap text-sm">{basics.discountTargetAudience}</p>
            </div>
          ) : null}
          {(basics.discountPricePromotion ?? "").trim() ? (
            <div className="sm:col-span-2">
              <span className="text-[10px] text-muted-foreground">{t("marketingCollabDetailBasicsSummary")}</span>
              <p className="text-sm">{basics.discountPricePromotion}</p>
            </div>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading")}
        </div>
      ) : (
        <>
          <section className="space-y-3 rounded-xl border border-border/60 bg-background px-4 py-3">
            <h3 className="text-sm font-semibold">{t("marketingCollabDetailSectionPartner")}</h3>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailPartnerName")}</Label>
              <Input
                value={draft.partnerName}
                onChange={(e) => set({ partnerName: e.target.value })}
                placeholder={t("marketingCollabDetailPartnerNamePh")}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailPartnerType")}</Label>
              <select
                value={draft.partnerType}
                onChange={(e) =>
                  set({ partnerType: e.target.value as MarketingCollabDetail["partnerType"] })
                }
                className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                <option value="">{t("marketingCollabDetailPartnerTypeUnset")}</option>
                <option value="enterprise">{t("marketingCollabDetailPartnerTypeEnterprise")}</option>
                <option value="school">{t("marketingCollabDetailPartnerTypeSchool")}</option>
                <option value="public">{t("marketingCollabDetailPartnerTypePublic")}</option>
                <option value="other">{t("marketingCollabDetailPartnerTypeOther")}</option>
              </select>
            </div>
            {draft.partnerType === "other" && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailPartnerTypeOtherLabel")}</Label>
                <Input
                  value={draft.partnerTypeOther}
                  onChange={(e) => set({ partnerTypeOther: e.target.value })}
                  placeholder={t("marketingCollabDetailPartnerTypeOtherPh")}
                  className="h-9"
                />
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 bg-background px-4 py-3">
            <h3 className="text-sm font-semibold">{t("marketingCollabDetailSectionIdProof")}</h3>
            <p className="text-[11px] text-muted-foreground">{t("marketingCollabDetailIdProofHint")}</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {scopeCheckbox(
                "collab-id-emp",
                t("marketingCollabDetailIdProofEmployee"),
                draft.idProofEmployeeCard,
                (v) => set({ idProofEmployeeCard: v })
              )}
              {scopeCheckbox(
                "collab-id-stu",
                t("marketingCollabDetailIdProofStudent"),
                draft.idProofStudentCard,
                (v) => set({ idProofStudentCard: v })
              )}
              {scopeCheckbox(
                "collab-id-mem",
                t("marketingCollabDetailIdProofMembership"),
                draft.idProofMembership,
                (v) => set({ idProofMembership: v })
              )}
              {scopeCheckbox(
                "collab-id-oth",
                t("marketingCollabDetailIdProofOtherCb"),
                draft.idProofOther,
                (v) => set({ idProofOther: v })
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailIdProofNote")}</Label>
              <Textarea
                value={draft.idProofNote}
                onChange={(e) => set({ idProofNote: e.target.value })}
                rows={2}
                className="text-sm"
                placeholder={t("marketingCollabDetailIdProofNotePh")}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 bg-background px-4 py-3">
            <h3 className="text-sm font-semibold">{t("marketingCollabDetailSectionStorePosDiscount")}</h3>
            <p className="text-[11px] text-muted-foreground">{t("marketingCollabDetailPosDiscountHint")}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailPosDiscountTypeLabel")}</Label>
                <select
                  value={draft.posDiscountType}
                  onChange={(e) => {
                    const nextType = e.target.value as MarketingCollabDetail["posDiscountType"]
                    if (nextType === "amount") {
                      set({
                        posDiscountType: nextType,
                        posMaxPerOrder: Math.max(1, draft.posMaxPerOrder || 10),
                        posAllowQuantityEntry: true,
                      })
                    } else if (nextType === "percent") {
                      set({
                        posDiscountType: nextType,
                        posMaxPerOrder: 1,
                        posAllowQuantityEntry: false,
                      })
                    } else {
                      set({ posDiscountType: nextType })
                    }
                  }}
                  className="flex h-9 w-full max-w-md rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                >
                  <option value="">{t("marketingCollabDetailPosDiscountTypeUnset")}</option>
                  <option value="percent">{t("marketingCollabDetailPosDiscountTypePercent")}</option>
                  <option value="amount">{t("marketingCollabDetailPosDiscountTypeAmount")}</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  {draft.posDiscountType === "amount"
                    ? t("marketingCollabDetailPosDiscountValueBaht")
                    : t("marketingCollabDetailPosDiscountValuePercent")}
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={draft.posDiscountType === "percent" ? 100 : undefined}
                  step={draft.posDiscountType === "percent" ? 1 : 1}
                  value={draft.posDiscountValue || ""}
                  onChange={(e) =>
                    set({ posDiscountValue: Math.max(0, Number(e.target.value) || 0) })
                  }
                  placeholder={draft.posDiscountType === "percent" ? "10" : "50"}
                  className="h-9"
                  disabled={!draft.posDiscountType}
                />
              </div>
            </div>
            {draft.posDiscountType === "amount" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">
                    {t("marketingCollabDetailPosMaxPerOrder")}
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    step={1}
                    value={draft.posMaxPerOrder || ""}
                    onChange={(e) =>
                      set({ posMaxPerOrder: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })
                    }
                    className="h-9"
                  />
                  <p className="text-[11px] text-muted-foreground">{t("marketingCollabDetailPosMaxPerOrderHint")}</p>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.posAllowQuantityEntry !== false}
                      onChange={(e) => set({ posAllowQuantityEntry: e.target.checked })}
                    />
                    {t("marketingCollabDetailPosAllowQuantityEntry")}
                  </label>
                </div>
              </div>
            ) : null}
            <p className="text-[11px] font-medium text-foreground/90">{t("marketingCollabDetailSectionScope")}</p>
            <p className="text-[11px] text-muted-foreground">{t("marketingCollabDetailScopeHint")}</p>
            <div className="space-y-4 rounded-lg border border-border/50 bg-muted/10 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold">{tr("marketingCollabScopeMainTitle", "1. 대분류 선택")}</p>
                {scopeCatalogLoading ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {t("loading")}
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    {tr("marketingCollabScopeSelectedCount", "선택")} {dynamicScopeCount}
                  </span>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {mainCategories.map((main) =>
                  scopeCheckbox(
                    `collab-main-${main}`,
                    main,
                    selectedMainSet.has(main),
                    (checked) => {
                      const nextMains = toggleListValue(selectedScopeMainCategories, main, checked)
                      const nextCategoryKeys = checked
                        ? selectedScopeCategoryKeys
                        : selectedScopeCategoryKeys.filter((key) => !key.startsWith(`${main}::`))
                      set({ scopeMainCategories: nextMains, scopeCategoryKeys: nextCategoryKeys })
                    }
                  )
                )}
              </div>

              <div className="space-y-2 border-t border-border/50 pt-3">
                <p className="text-xs font-semibold">{tr("marketingCollabScopeCategoryTitle", "2. 하위 카테고리 선택")}</p>
                {selectedScopeMainCategories.length <= 0 ? (
                  <p className="text-[11px] text-muted-foreground">
                    {tr("marketingCollabScopePickMainFirst", "대분류를 먼저 선택하면 하위 카테고리를 고를 수 있습니다.")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {selectedScopeMainCategories.map((main) => {
                      const subs = categoriesByMain[main] || Array.from(new Set(
                        menus
                          .filter((m) => String(m.categoryMain ?? "").trim() === main)
                          .map((m) => String(m.category ?? "").trim())
                          .filter(Boolean)
                      ))
                      if (subs.length <= 0) return null
                      return (
                        <div key={main} className="rounded-md bg-background/70 p-2">
                          <p className="mb-2 text-[11px] font-medium text-muted-foreground">{main}</p>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {subs.map((cat) => {
                              const key = categoryScopeKey(main, cat)
                              return scopeCheckbox(
                                `collab-cat-${key}`,
                                cat,
                                selectedCategoryKeySet.has(key),
                                (checked) =>
                                  set({
                                    scopeCategoryKeys: toggleListValue(selectedScopeCategoryKeys, key, checked),
                                  })
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t border-border/50 pt-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs font-semibold">{tr("marketingCollabScopeMenuTitle", "3. 특정 메뉴 선택")}</p>
                  <Input
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    placeholder={tr("marketingCollabScopeMenuSearch", "메뉴명/코드 검색")}
                    className="h-8 sm:w-64"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {tr(
                    "marketingCollabScopeMenuHint",
                    "1·2·3단계를 함께 고르면 모두 맞는 메뉴만 할인됩니다. Snow Onion만 줄이려면 Chicken 전체 체크는 해제하고 SNOW·해당 메뉴만 선택하세요."
                  )}
                </p>
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border/40 bg-background/70 p-2">
                  {visibleMenuRows.length <= 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">
                      {tr("marketingCollabScopeMenuEmpty", "표시할 메뉴가 없습니다.")}
                    </p>
                  ) : (
                    visibleMenuRows.map((menu) => {
                      const id = String(menu.id)
                      const label = `${menu.code ? `[${menu.code}] ` : ""}${menu.name}`
                      return (
                        <div key={id} className="flex items-start gap-2 py-1">
                          <Checkbox
                            id={`collab-menu-${id}`}
                            checked={selectedMenuIdSet.has(id)}
                            onCheckedChange={(checked) =>
                              set({ scopeMenuIds: toggleListValue(selectedScopeMenuIds, id, checked === true) })
                            }
                          />
                          <label htmlFor={`collab-menu-${id}`} className="min-w-0 cursor-pointer text-sm leading-tight">
                            <span className="block truncate">{label}</span>
                            <span className="block text-[11px] text-muted-foreground">
                              {String(menu.categoryMain ?? "").trim()} / {String(menu.category ?? "").trim()}
                            </span>
                          </label>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailScopeNote")}</Label>
              <Textarea
                value={draft.scopeNote}
                onChange={(e) => set({ scopeNote: e.target.value })}
                rows={2}
                className="text-sm"
                placeholder={t("marketingCollabDetailScopeNotePh")}
              />
            </div>
            <div className="space-y-2 sm:col-span-2 border-t border-border/50 pt-3">
              <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailDiscountStackingNote")}</Label>
              <Textarea
                value={draft.discountStackingNote}
                onChange={(e) => set({ discountStackingNote: e.target.value })}
                rows={2}
                className="text-sm"
                placeholder={t("marketingCollabDetailDiscountStackingPh")}
              />
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 bg-background px-4 py-3">
            <h3 className="text-sm font-semibold">{t("marketingCollabDetailSectionDiscountOps")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailRulesNote")}</Label>
                <Textarea
                  value={draft.rulesNote}
                  onChange={(e) => set({ rulesNote: e.target.value })}
                  rows={3}
                  className="text-sm"
                  placeholder={t("marketingCollabDetailRulesNotePh")}
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailOpsFlowNote")}</Label>
                <Textarea
                  value={draft.opsFlowNote}
                  onChange={(e) => set({ opsFlowNote: e.target.value })}
                  rows={3}
                  className="text-sm"
                  placeholder={t("marketingCollabDetailOpsFlowNotePh")}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3 rounded-xl border border-border/60 bg-background px-4 py-3">
            <h3 className="text-sm font-semibold">{t("marketingCollabDetailSectionContract")}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailContractRef")}</Label>
                <Input
                  value={draft.contractReference}
                  onChange={(e) => set({ contractReference: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailContactName")}</Label>
                <Input
                  value={draft.contactName}
                  onChange={(e) => set({ contactName: e.target.value })}
                  className="h-9"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">{t("marketingCollabDetailContactInfo")}</Label>
                <Input
                  value={draft.contactInfo}
                  onChange={(e) => set({ contactInfo: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            <Button type="button" className="gap-1.5" disabled={saving} onClick={onSave}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("marketingCollabDetailSave")}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
