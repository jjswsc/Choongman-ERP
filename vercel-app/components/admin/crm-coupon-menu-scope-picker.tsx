"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { getPosMenuCategories, getPosMenus, type PosMenu } from "@/lib/api-client"
import {
  collectCategoryOptions,
  filterPosMenusForCouponPicker,
  formatCouponItemScopeSummary,
  type CouponItemScope,
} from "@/lib/crm-coupon-item-scope"
import { cn } from "@/lib/utils"

type CrmCouponMenuScopePickerProps = {
  value: CouponItemScope
  onChange: (next: CouponItemScope) => void
  t?: (key: string) => string
}

export function CrmCouponMenuScopePicker({ value, onChange, t = (k) => k }: CrmCouponMenuScopePickerProps) {
  const [menus, setMenus] = React.useState<PosMenu[]>([])
  const [categories, setCategories] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)
  const [queryDraft, setQueryDraft] = React.useState("")
  const [query, setQuery] = React.useState("")
  const [showInactive, setShowInactive] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const [menuRows, catRes] = await Promise.all([
          getPosMenus({ fresh: true }),
          getPosMenuCategories(),
        ])
        if (cancelled) return
        setMenus(menuRows || [])
        setCategories(collectCategoryOptions(menuRows || [], catRes?.mainCategories || []))
      } catch {
        if (!cancelled) {
          setMenus([])
          setCategories([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const menuById = React.useMemo(() => {
    const map = new Map<string, PosMenu>()
    for (const m of menus) map.set(String(m.id), m)
    return map
  }, [menus])

  const visibleMenus = React.useMemo(() => {
    const filtered = filterPosMenusForCouponPicker(menus, query).filter((m) => showInactive || m.isActive !== false)
    return filtered.slice(0, 80)
  }, [menus, query, showInactive])

  const summary = formatCouponItemScopeSummary(value, menuById, t)
  const hasScope = value.menuIds.length > 0 || value.categoryCodes.length > 0

  const toggleMenu = (menuId: string) => {
    const id = String(menuId).trim()
    if (!id) return
    const set = new Set(value.menuIds)
    if (set.has(id)) set.delete(id)
    else set.add(id)
    onChange({ ...value, menuIds: Array.from(set) })
  }

  const toggleCategory = (code: string) => {
    const c = String(code).trim().toUpperCase()
    if (!c) return
    const set = new Set(value.categoryCodes)
    if (set.has(c)) set.delete(c)
    else set.add(c)
    onChange({ ...value, categoryCodes: Array.from(set) })
  }

  const clearScope = () => onChange({ menuIds: [], categoryCodes: [] })

  return (
    <section className="space-y-4 rounded-xl border border-border/70 bg-card p-5 shadow-sm ring-1 ring-black/[0.02]">
      <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-4 w-1 shrink-0 rounded-full bg-indigo-500" aria-hidden />
            <h3 className="text-sm font-semibold tracking-tight text-foreground">
              {t("crmCouponScopeTitle") || "적용 메뉴"}
            </h3>
          </div>
          <p className="mt-1.5 pl-3 text-xs leading-relaxed text-muted-foreground">
            {t("crmCouponScopeHint") || "비워 두면 전체 주문에 적용됩니다. 메뉴 또는 카테고리를 선택하세요."}
          </p>
        </div>
        {hasScope ? (
          <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 text-xs" onClick={clearScope}>
            {t("crmCouponScopeClear") || "전체 메뉴"}
          </Button>
        ) : null}
      </div>

      <p className="rounded-lg border border-indigo-200/70 bg-indigo-50/60 px-3 py-2 text-xs font-medium text-indigo-900">
        {summary}
      </p>

      {value.menuIds.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.menuIds.map((id) => {
            const menu = menuById.get(id)
            return (
              <Badge key={id} variant="secondary" className="gap-1 pr-1">
                {menu ? `${menu.name} (${menu.code})` : `#${id}`}
                <button type="button" className="rounded p-0.5 hover:bg-black/10" onClick={() => toggleMenu(id)}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            )
          })}
        </div>
      ) : null}

      {categories.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("crmCouponScopeCategories") || "카테고리"}</p>
          <div className="flex flex-wrap gap-1.5">
            {categories.map((code) => {
              const selected = value.categoryCodes.includes(code)
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => toggleCategory(code)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                    selected ? "border-indigo-500 bg-indigo-100 text-indigo-900" : "bg-background hover:bg-muted/60"
                  )}
                >
                  {code}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("crmCouponScopeMenus") || "메뉴 선택"}</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            setQuery(queryDraft.trim())
          }}
        >
          <Input
            value={queryDraft}
            onChange={(e) => setQueryDraft(e.target.value)}
            placeholder={t("crmCouponScopeSearchPh") || "메뉴명 · 코드 · 카테고리"}
            className="h-9"
          />
          <Button type="submit" variant="outline" size="icon" className="h-9 w-9 shrink-0" title={t("btn_query") || "검색"}>
            <Search className="h-4 w-4" />
          </Button>
        </form>
        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          {t("crmCouponScopeShowInactive") || "비활성 메뉴 포함"}
        </label>
        <div className="mt-2 max-h-52 overflow-y-auto rounded-lg border bg-muted/20">
          {loading ? (
            <p className="p-3 text-xs text-muted-foreground">{t("loading") || "불러오는 중…"}</p>
          ) : visibleMenus.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">{t("crmCouponScopeMenuEmpty") || "검색 결과가 없습니다."}</p>
          ) : (
            visibleMenus.map((menu) => {
              const selected = value.menuIds.includes(String(menu.id))
              return (
                <label
                  key={menu.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0 hover:bg-muted/40",
                    selected && "bg-indigo-50/80"
                  )}
                >
                  <input type="checkbox" checked={selected} onChange={() => toggleMenu(String(menu.id))} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{menu.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {menu.code}
                      {(menu.categoryMain || menu.category) ? ` · ${menu.categoryMain || menu.category}` : ""}
                    </span>
                  </span>
                  {menu.isActive === false ? (
                    <Badge variant="outline" className="text-[10px]">
                      OFF
                    </Badge>
                  ) : null}
                </label>
              )
            })
          )}
        </div>
        {!loading && filterPosMenusForCouponPicker(menus, query).length > 80 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("crmCouponScopeMenuTruncated") || "검색어를 입력해 목록을 좁혀 주세요."}
          </p>
        ) : null}
      </div>
    </section>
  )
}
