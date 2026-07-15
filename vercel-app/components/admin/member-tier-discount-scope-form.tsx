"use client"

import * as React from "react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getPosMenuCategoriesConfig, getPosMenus, type PosMenu } from "@/lib/api-client"
import type { MemberTierDiscountPolicy } from "@/lib/member-tier-discount-policy"
import {
  collabCategoryScopeKey,
  mergeCollabScopeMainCategories,
  subsForCollabScopeMain,
} from "@/lib/pos-collab-scope-catalog"
import { Loader2 } from "lucide-react"

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

function toggleListValue(list: string[], value: string, checked: boolean): string[] {
  const v = String(value ?? "").trim()
  if (!v) return list
  const set = new Set(list.map((x) => String(x ?? "").trim()).filter(Boolean))
  if (checked) set.add(v)
  else set.delete(v)
  return Array.from(set)
}

export function MemberTierDiscountScopeForm({
  t,
  policy,
  onChange,
}: {
  t: (key: string) => string
  policy: MemberTierDiscountPolicy
  onChange: (next: MemberTierDiscountPolicy) => void
}) {
  const [mainCategories, setMainCategories] = React.useState<string[]>([])
  const [categoriesByMain, setCategoriesByMain] = React.useState<Record<string, string[]>>({})
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [loading, setLoading] = React.useState(false)
  const [menuSearch, setMenuSearch] = React.useState("")

  const set = React.useCallback(
    (patch: Partial<MemberTierDiscountPolicy>) => {
      onChange({ ...policy, ...patch })
    },
    [onChange, policy]
  )

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([getPosMenuCategoriesConfig(), getPosMenus()])
      .then(([cfg, menuRows]) => {
        if (cancelled) return
        const mains = mergeCollabScopeMainCategories(
          Object.keys(cfg?.categoriesByMain || {}),
          menuRows || []
        )
        setMainCategories(mains)
        setCategoriesByMain(cfg?.categoriesByMain || {})
        setMenus((menuRows || []).filter((m) => m.isActive !== false))
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedMainSet = React.useMemo(
    () => new Set((policy.scopeMainCategories || []).map((x) => String(x).trim()).filter(Boolean)),
    [policy.scopeMainCategories]
  )
  const selectedCategoryKeySet = React.useMemo(
    () => new Set((policy.scopeCategoryKeys || []).map((x) => String(x).trim()).filter(Boolean)),
    [policy.scopeCategoryKeys]
  )
  const selectedMenuIdSet = React.useMemo(
    () => new Set((policy.scopeMenuIds || []).map((x) => String(x).trim()).filter(Boolean)),
    [policy.scopeMenuIds]
  )
  const visibleMenuRows = React.useMemo(() => {
    const q = menuSearch.trim().toLowerCase()
    return menus
      .filter((m) => {
        if (!q) return true
        const blob = `${m.code || ""} ${m.name || ""} ${m.categoryMain || ""} ${m.category || ""}`.toLowerCase()
        return blob.includes(q)
      })
      .slice(0, 120)
  }, [menuSearch, menus])

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-orange-100 bg-orange-50/50 px-3 py-2 text-xs leading-relaxed text-orange-950/80">
        {t("memberTierDiscountScopeHint")}
      </p>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded-lg border border-orange-100/80 bg-background px-3 py-2.5 text-sm shadow-sm">
          <Checkbox
            checked={policy.excludePromoAndSets}
            onCheckedChange={(x) => set({ excludePromoAndSets: x === true })}
          />
          {t("memberTierDiscountExcludePromoSets")}
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-orange-100/80 bg-background px-3 py-2.5 text-sm shadow-sm">
          <Checkbox
            checked={policy.stackWithCollab}
            onCheckedChange={(x) => set({ stackWithCollab: x === true })}
          />
          {t("memberTierDiscountStackCollab")}
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-orange-100/80 bg-background px-3 py-2.5 text-sm shadow-sm">
          <Checkbox
            checked={policy.stackWithCoupons}
            onCheckedChange={(x) => set({ stackWithCoupons: x === true })}
          />
          {t("memberTierDiscountStackCoupons")}
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("loading")}
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-orange-200/60 bg-gradient-to-br from-orange-50/40 to-amber-50/20 p-3.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-900/80">
            {t("marketingCollabScopeMainTitle")}
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {mainCategories.map((main) =>
              scopeCheckbox(`tier-main-${main}`, main, selectedMainSet.has(main), (checked) => {
                const nextMains = toggleListValue(policy.scopeMainCategories, main, checked)
                const nextCategoryKeys = checked
                  ? policy.scopeCategoryKeys
                  : policy.scopeCategoryKeys.filter((key) => !key.startsWith(`${main}::`))
                set({ scopeMainCategories: nextMains, scopeCategoryKeys: nextCategoryKeys })
              })
            )}
          </div>

          <div className="space-y-2 border-t border-orange-200/50 pt-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-900/80">
              {t("marketingCollabScopeCategoryTitle")}
            </p>
            {policy.scopeMainCategories.length <= 0 ? (
              <p className="text-[11px] text-muted-foreground">{t("marketingCollabScopePickMainFirst")}</p>
            ) : (
              <div className="space-y-3">
                {policy.scopeMainCategories.map((main) => {
                  const subs = subsForCollabScopeMain(main, categoriesByMain, menus)
                  if (subs.length <= 0) return null
                  return (
                    <div key={main} className="rounded-lg border border-orange-100/70 bg-white/80 p-2.5 shadow-sm">
                      <p className="mb-2 text-[11px] font-medium text-muted-foreground">{main}</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {subs.map((cat) => {
                          const key = collabCategoryScopeKey(main, cat)
                          return scopeCheckbox(
                            `tier-cat-${key}`,
                            cat,
                            selectedCategoryKeySet.has(key),
                            (checked) =>
                              set({
                                scopeCategoryKeys: toggleListValue(policy.scopeCategoryKeys, key, checked),
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

          <div className="space-y-2 border-t border-orange-200/50 pt-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-900/80">
                {t("marketingCollabScopeMenuTitle")}
              </p>
              <Input
                value={menuSearch}
                onChange={(e) => setMenuSearch(e.target.value)}
                placeholder={t("marketingCollabScopeMenuSearch")}
                className="h-8 bg-background sm:w-64"
              />
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-orange-100/70 bg-white/80 p-2 shadow-sm">
              {visibleMenuRows.length <= 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  {t("marketingCollabScopeMenuEmpty")}
                </p>
              ) : (
                visibleMenuRows.map((menu) => {
                  const id = String(menu.id || "")
                  const label = `${menu.code || id} · ${menu.name || ""} (${menu.categoryMain || ""}/${menu.category || ""})`
                  return scopeCheckbox(
                    `tier-menu-${id}`,
                    label,
                    selectedMenuIdSet.has(id),
                    (checked) => set({ scopeMenuIds: toggleListValue(policy.scopeMenuIds, id, checked) })
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
