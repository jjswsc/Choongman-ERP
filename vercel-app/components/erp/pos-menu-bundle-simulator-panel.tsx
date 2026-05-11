"use client"

import * as React from "react"
import { Calculator, Plus, Trash2 } from "lucide-react"
import { appAlert } from "@/lib/app-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getPosMenuOptions,
  getMenuCost,
  type PosMenu,
  type PosMenuOption,
  type PosMenuCategoriesConfig,
} from "@/lib/api-client"
import { POS_CATEGORIES_BY_MAIN } from "@/lib/pos-menu-categories"
import { promoCostKey, resolveBundleSalePriceThb } from "@/lib/promo-economics"
import { POS_CHICKEN_DEFAULT_OPTION_DISPLAY } from "@/lib/pos-print-translate"

const CHICKEN_CODE_PREFIX = "c"
function isChickenMenu(code: string | undefined): boolean {
  return !!code?.trim().toLowerCase().startsWith(CHICKEN_CODE_PREFIX)
}
function isChickenDefaultOption(name: string | undefined): boolean {
  if (!name?.trim()) return false
  const n = name.trim()
  return (
    /^S\s*[-]?\s*순살\s*$/i.test(n) ||
    /^S\s*[-]?\s*Boneless\s*$/i.test(n) ||
    n === "S 순살" ||
    n === "S - 순살" ||
    n === "S-순살" ||
    n === "S Boneless" ||
    n === "S - Boneless" ||
    n === "S-Boneless"
  )
}

const CHICKEN_IMPLICIT_BASE_OPTION_NAME = POS_CHICKEN_DEFAULT_OPTION_DISPLAY

function chickenLineOptionDisplayName(
  menuCode: string | undefined,
  optionId: string | null | undefined,
  optionLabel: string | undefined
): string | null {
  const trimmed = optionLabel?.trim()
  if (trimmed) return trimmed
  if (isChickenMenu(menuCode) && !optionId) return CHICKEN_IMPLICIT_BASE_OPTION_NAME
  return null
}

export type PosMenuBundleSimulatorPanelProps = {
  menus: PosMenu[]
  mainCategories: string[]
  categoriesConfig: PosMenuCategoriesConfig | null
  optionPartLabel: (name: string) => string
}

type BundleLine = {
  key: string
  menuId: string
  optionId: string | null
  qty: number
  menuName: string
  optionLabel?: string
}

type CostEntry = { hall: number; del: number }

export function PosMenuBundleSimulatorPanel({
  menus,
  mainCategories,
  categoriesConfig,
  optionPartLabel,
}: PosMenuBundleSimulatorPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const [allOptions, setAllOptions] = React.useState<PosMenuOption[]>([])
  const [simMain, setSimMain] = React.useState("all")
  const [simSub, setSimSub] = React.useState("all")
  const [simSearch, setSimSearch] = React.useState("")
  const [lines, setLines] = React.useState<BundleLine[]>([])
  const [costMap, setCostMap] = React.useState<Record<string, CostEntry>>({})

  const [pickMenuId, setPickMenuId] = React.useState("")
  const [pickOptionId, setPickOptionId] = React.useState<string | null>(null)
  const [pickQty, setPickQty] = React.useState("1")

  const [discountMode, setDiscountMode] = React.useState<"pct" | "baht">("pct")
  const [discountPctStr, setDiscountPctStr] = React.useState("")
  const [discountBahtStr, setDiscountBahtStr] = React.useState("")
  const [saleDirectStr, setSaleDirectStr] = React.useState("")

  React.useEffect(() => {
    void getPosMenuOptions()
      .then((list) => setAllOptions(Array.isArray(list) ? list : []))
      .catch(() => setAllOptions([]))
  }, [])

  const optionsByMenuId = React.useMemo(() => {
    const m: Record<string, PosMenuOption[]> = {}
    for (const o of allOptions) {
      const mid = String(o.menuId ?? "")
      if (!mid) continue
      if (!m[mid]) m[mid] = []
      m[mid].push(o)
    }
    return m
  }, [allOptions])

  const simSubCategories = React.useMemo(() => {
    const main = simMain === "all" ? null : simMain.trim() || null
    if (!main) {
      const s = new Set<string>()
      for (const m of menus) {
        const c = m.category?.trim()
        if (c) s.add(c)
      }
      return Array.from(s).sort()
    }
    const presetFromConfig = categoriesConfig?.categoriesByMain?.[main]
    const presetFromLib =
      main in POS_CATEGORIES_BY_MAIN ? POS_CATEGORIES_BY_MAIN[main as keyof typeof POS_CATEGORIES_BY_MAIN] : null
    const preset = presetFromConfig?.length ? presetFromConfig : presetFromLib ?? []
    const fromMenus = menus
      .filter((m) => (m.categoryMain ?? "") === main)
      .map((m) => m.category)
      .filter((c): c is string => typeof c === "string" && c !== "")
    return Array.from(new Set([...preset, ...fromMenus]))
      .filter((c): c is string => typeof c === "string")
      .sort()
  }, [simMain, menus, categoriesConfig])

  const eligibleMenus = React.useMemo(
    () => menus.filter((m) => m.isActive && !(m.promoId != null && String(m.promoId).trim() !== "")),
    [menus]
  )

  const filteredPickMenus = React.useMemo(() => {
    const q = simSearch.trim().toLowerCase()
    return eligibleMenus.filter((m) => {
      if (simMain !== "all" && (m.categoryMain ?? "") !== simMain) return false
      if (simSub !== "all" && (m.category ?? "") !== simSub) return false
      if (q) {
        const nm = (m.name ?? "").toLowerCase()
        const cd = (m.code ?? "").toLowerCase()
        if (!nm.includes(q) && !cd.includes(q)) return false
      }
      return true
    })
  }, [eligibleMenus, simMain, simSub, simSearch])

  const menuById = React.useMemo(() => {
    const r: Record<string, PosMenu> = {}
    for (const m of menus) r[String(m.id)] = m
    return r
  }, [menus])

  const missingCostKeys = React.useMemo(() => {
    const need = new Set<string>()
    for (const ln of lines) {
      const k = promoCostKey(ln.menuId, ln.optionId)
      if (costMap[k] == null) need.add(k)
    }
    return [...need].sort().join("|")
  }, [lines, costMap])

  React.useEffect(() => {
    if (!missingCostKeys) return
    const keys = missingCostKeys.split("|").filter(Boolean)
    let cancelled = false
    for (const k of keys) {
      const line = lines.find((ln) => promoCostKey(ln.menuId, ln.optionId) === k)
      if (!line) continue
      void getMenuCost({ menuId: line.menuId, optionId: line.optionId || undefined })
        .then((r) => {
          if (cancelled) return
          const hall = (r as { costHall?: number }).costHall ?? (r as { cost?: number }).cost ?? 0
          const del = (r as { costDelivery?: number }).costDelivery ?? hall
          setCostMap((prev) => (prev[k] != null ? prev : { ...prev, [k]: { hall, del } }))
        })
        .catch(() => {
          if (cancelled) return
          setCostMap((prev) => (prev[k] != null ? prev : { ...prev, [k]: { hall: 0, del: 0 } }))
        })
    }
    return () => {
      cancelled = true
    }
  }, [missingCostKeys, lines])

  const unitRegPrice = (menuId: string, optionId: string | null) => {
    const menu = menuById[menuId]
    if (!menu) return 0
    const opts = optionsByMenuId[menuId] || []
    const opt = optionId ? opts.find((o) => String(o.id) === String(optionId)) : null
    return (menu.price ?? 0) + (opt?.priceModifier ?? 0)
  }

  const regularSum = lines.reduce((s, ln) => s + unitRegPrice(ln.menuId, ln.optionId) * ln.qty, 0)
  const costHallTotal = lines.reduce((s, ln) => {
    const k = promoCostKey(ln.menuId, ln.optionId)
    const c = costMap[k]
    return s + (c?.hall ?? 0) * ln.qty
  }, 0)
  const costDelTotal = lines.reduce((s, ln) => {
    const k = promoCostKey(ln.menuId, ln.optionId)
    const c = costMap[k]
    return s + (c?.del ?? 0) * ln.qty
  }, 0)
  const costsReady =
    lines.length > 0 && lines.every((ln) => costMap[promoCostKey(ln.menuId, ln.optionId)] != null)

  const salePrice = resolveBundleSalePriceThb({
    regularPriceSum: regularSum,
    salePriceDirectStr: saleDirectStr,
    discountPctStr,
    discountBahtStr,
    discountMode,
  })
  const discountAmt = Math.max(0, Math.round(regularSum) - salePrice)

  const marginHall = salePrice - costHallTotal
  const marginPctHall = salePrice > 0 ? (marginHall / salePrice) * 100 : 0
  const costRateHall = salePrice > 0 ? (costHallTotal / salePrice) * 100 : 0

  const marginDel = salePrice - costDelTotal
  const marginPctDel = salePrice > 0 ? (marginDel / salePrice) * 100 : 0
  const costRateDel = salePrice > 0 ? (costDelTotal / salePrice) * 100 : 0

  const addLine = async (menuId: string, optionId: string | null, qty: number) => {
    const menu = menuById[menuId]
    if (!menu) return
    const optsRaw = optionsByMenuId[menuId] || []
    const opts = isChickenMenu(menu.code) ? optsRaw.filter((o) => !isChickenDefaultOption(o.name)) : optsRaw
    const hasOptions = opts.length > 0
    if (hasOptions && !optionId && !isChickenMenu(menu.code)) {
      await appAlert(t("posPromoSelectOption"))
      return
    }
    const opt = optionId ? optsRaw.find((o) => String(o.id) === String(optionId)) : null
    setLines((prev) => [
      ...prev,
      {
        key: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        menuId,
        optionId,
        qty: Math.max(0.5, qty),
        menuName: menu.name ?? "",
        optionLabel: opt?.name,
      },
    ])
  }

  const handlePickAdd = () => {
    if (!pickMenuId.trim()) return
    const qty = Number(pickQty) || 1
    void addLine(pickMenuId, pickOptionId, qty)
    setPickMenuId("")
    setPickOptionId(null)
    setPickQty("1")
  }

  const pickOptionsFiltered = React.useMemo(() => {
    const pickOptions = pickMenuId ? optionsByMenuId[pickMenuId] || [] : []
    const menu = menuById[pickMenuId]
    if (!menu) return pickOptions
    if (isChickenMenu(menu.code)) return pickOptions.filter((o) => !isChickenDefaultOption(o.name))
    return pickOptions
  }, [pickMenuId, optionsByMenuId, menuById])

  return (
    <div className="mt-6 rounded-xl border border-primary/15 bg-card shadow-sm overflow-hidden">
      <div className="border-b bg-muted/30 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <Calculator className="h-4 w-4 text-primary shrink-0" />
          <h3 className="text-sm font-bold">{t("posMenuBundleSimTitle")}</h3>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground leading-relaxed max-w-3xl">{t("posMenuBundleSimDesc")}</p>
      </div>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,320px)_1fr] lg:gap-6">
        {/* 좌: 필터 + 메뉴 선택 */}
        <div className="flex min-h-0 flex-col gap-3 rounded-lg border bg-muted/10 p-3">
          <p className="text-xs font-semibold text-foreground">{t("posMenuBundleSimPickTitle")}</p>
          <Select
            value={simMain}
            onValueChange={(v) => {
              setSimMain(v)
              setSimSub("all")
            }}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={t("posMenuCategoryMain")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
              {mainCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={simSub} onValueChange={setSimSub}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={t("posMenuCategorySub")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("posMenuCategoryAll")}</SelectItem>
              {simSubCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-9 text-xs"
            placeholder={t("itemsSearchPh")}
            value={simSearch}
            onChange={(e) => setSimSearch(e.target.value)}
          />

          <div className="max-h-56 overflow-y-auto rounded-md border bg-background">
            {filteredPickMenus.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">{t("itemsNoResults")}</p>
            ) : (
              <ul className="divide-y text-xs">
                {filteredPickMenus.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 px-2 py-2 hover:bg-muted/40">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{m.name}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        <span className="font-mono">{m.code}</span>
                        {(m.categoryMain || m.category) && (
                          <span>
                            {" "}
                            · {m.categoryMain ?? ""}
                            {m.category ? ` / ${m.category}` : ""}
                          </span>
                        )}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-7 shrink-0 px-2 text-[10px]"
                      onClick={() => {
                        setPickMenuId(String(m.id))
                        setPickOptionId(null)
                      }}
                    >
                      {t("posMenuBundleSimUseMenu")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {pickMenuId ? (
            <div className="space-y-2 rounded-md border border-dashed border-primary/30 bg-primary/5 p-2">
              <p className="text-[10px] font-semibold text-foreground">{t("posMenuBundleSimConfirmLine")}</p>
              <p className="text-xs font-medium">{menuById[pickMenuId]?.name}</p>
              {pickOptionsFiltered.length > 0 ? (
                <Select
                  value={pickOptionId ?? "_"}
                  onValueChange={(v) => setPickOptionId(v === "_" ? null : v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder={t("posPromoSelectOption")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">
                      {isChickenMenu(menuById[pickMenuId]?.code)
                        ? t("posIngredientScopeBaseChicken") || t("posOptionDefault")
                        : t("posPromoSelectOption")}
                    </SelectItem>
                    {pickOptionsFiltered.map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {optionPartLabel(o.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0.5}
                  step={0.5}
                  className="h-8 w-20 text-right text-xs tabular-nums"
                  value={pickQty}
                  onChange={(e) => setPickQty(e.target.value)}
                  aria-label={t("qty")}
                />
                <Button type="button" size="sm" className="h-8 flex-1 text-xs" onClick={handlePickAdd}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {t("posMenuBundleSimAddLine")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 shrink-0 text-xs"
                  onClick={() => {
                    setPickMenuId("")
                    setPickOptionId(null)
                  }}
                >
                  {t("cancel")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* 우: 조합 + 할인 + 지표 */}
        <div className="flex min-h-0 flex-col gap-4">
          <div>
            <p className="mb-2 text-xs font-semibold">{t("posMenuBundleSimComposeTitle")}</p>
            <div className="max-h-48 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/60">
                    <th className="px-2 py-2 text-left font-medium">{t("posPromoItems")}</th>
                    <th className="w-16 px-2 py-2 text-right font-medium">{t("qty")}</th>
                    <th className="w-24 px-2 py-2 text-right font-medium">{t("posMenuBundleColReg")}</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                        {t("posMenuBundleSimEmpty")}
                      </td>
                    </tr>
                  ) : (
                    lines.map((ln) => {
                      const reg = unitRegPrice(ln.menuId, ln.optionId) * ln.qty
                      return (
                        <tr key={ln.key} className="border-b border-border/50 last:border-0">
                          <td className="px-2 py-1.5">
                            <span className="font-medium">{ln.menuName}</span>
                            {(() => {
                              const menuRow = menuById[ln.menuId]
                              const disp = chickenLineOptionDisplayName(menuRow?.code, ln.optionId, ln.optionLabel)
                              return disp ? (
                                <span className="text-muted-foreground"> ({optionPartLabel(disp)})</span>
                              ) : null
                            })()}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            <Input
                              type="number"
                              min={0.5}
                              step={0.5}
                              className="ml-auto h-7 w-14 text-right text-[11px] tabular-nums"
                              value={ln.qty}
                              onChange={(e) => {
                                const v = Number(e.target.value)
                                setLines((prev) =>
                                  prev.map((x) => (x.key === ln.key ? { ...x, qty: Number.isFinite(v) ? v : x.qty } : x))
                                )
                              }}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">฿{Math.round(reg).toLocaleString()}</td>
                          <td className="px-1 py-1 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => setLines((prev) => prev.filter((x) => x.key !== ln.key))}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {lines.length > 0 && (
            <div className="space-y-3 rounded-lg border bg-muted/10 p-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-[10px] font-medium text-muted-foreground">{t("posMenuBundleSaleDirect")}</label>
                  <Input
                    className="mt-0.5 h-9 text-right text-sm tabular-nums"
                    inputMode="decimal"
                    placeholder={t("posMenuBundleSaleDirectPh")}
                    value={saleDirectStr}
                    onChange={(e) => setSaleDirectStr(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant={discountMode === "pct" ? "default" : "outline"}
                      className="h-8 flex-1 text-xs"
                      onClick={() => setDiscountMode("pct")}
                    >
                      {t("posMenuBundleDiscountModePct")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={discountMode === "baht" ? "default" : "outline"}
                      className="h-8 flex-1 text-xs"
                      onClick={() => setDiscountMode("baht")}
                    >
                      {t("posMenuBundleDiscountModeBaht")}
                    </Button>
                  </div>
                  {discountMode === "pct" ? (
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">{t("posPromoSimulatorDiscountPct")}</label>
                      <Input
                        className="mt-0.5 h-9 text-right text-sm tabular-nums"
                        inputMode="decimal"
                        placeholder="0"
                        value={discountPctStr}
                        onChange={(e) => setDiscountPctStr(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="text-[10px] font-medium text-muted-foreground">{t("posMenuBundleDiscountBaht")}</label>
                      <Input
                        className="mt-0.5 h-9 text-right text-sm tabular-nums"
                        inputMode="decimal"
                        placeholder="0"
                        value={discountBahtStr}
                        onChange={(e) => setDiscountBahtStr(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed">{t("posMenuBundleSalePriorityHint")}</p>
            </div>
          )}

          {lines.length > 0 && (
            <div
              className={cn(
                "grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-2",
                !costsReady && "opacity-80"
              )}
            >
              <div className="flex justify-between gap-2 sm:col-span-2">
                <span className="text-muted-foreground">{t("posMenuBundleRegularSum")}</span>
                <span className="font-mono font-semibold tabular-nums">฿{Math.round(regularSum).toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("posMenuBundleCostHall")}</span>
                <span className="font-mono tabular-nums">
                  {costsReady ? `฿${costHallTotal.toFixed(1)}` : t("posPromoSimulatorCalculating")}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">{t("posMenuBundleCostDelivery")}</span>
                <span className="font-mono tabular-nums">
                  {costsReady ? `฿${costDelTotal.toFixed(1)}` : t("posPromoSimulatorCalculating")}
                </span>
              </div>
              <div className="flex justify-between gap-2 sm:col-span-2 border-t pt-2">
                <span className="text-muted-foreground">{t("posMenuBundleSalePrice")}</span>
                <span className="font-mono font-bold tabular-nums text-primary">฿{salePrice.toLocaleString()}</span>
              </div>
              <div className="flex justify-between gap-2 sm:col-span-2">
                <span className="text-muted-foreground">{t("posMenuBundleDiscountAmt")}</span>
                <span className="font-mono tabular-nums">฿{discountAmt.toLocaleString()}</span>
              </div>
              <div className="sm:col-span-2 border-t pt-2 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{t("posMenuBundleHallChannel")}</p>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("posMenuBundleCostRate")}</span>
                  <span className="font-mono tabular-nums">{costsReady ? `${costRateHall.toFixed(1)}%` : "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("posMenuBundleMarginPct")}</span>
                  <span className={cn("font-mono tabular-nums", marginHall >= 0 ? "text-emerald-600" : "text-destructive")}>
                    {costsReady ? `${marginPctHall.toFixed(1)}%` : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-2 font-semibold">
                  <span>{t("posMenuBundleMarginBaht")}</span>
                  <span className={cn("font-mono tabular-nums", marginHall >= 0 ? "text-emerald-600" : "text-destructive")}>
                    {costsReady ? `฿${marginHall.toFixed(1)}` : "—"}
                  </span>
                </div>
              </div>
              <div className="sm:col-span-2 border-t pt-2 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {t("posMenuBundleDeliveryChannel")}
                </p>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("posMenuBundleCostRate")}</span>
                  <span className="font-mono tabular-nums">{costsReady ? `${costRateDel.toFixed(1)}%` : "—"}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{t("posMenuBundleMarginPct")}</span>
                  <span className={cn("font-mono tabular-nums", marginDel >= 0 ? "text-emerald-600" : "text-destructive")}>
                    {costsReady ? `${marginPctDel.toFixed(1)}%` : "—"}
                  </span>
                </div>
                <div className="flex justify-between gap-2 font-semibold">
                  <span>{t("posMenuBundleMarginBaht")}</span>
                  <span className={cn("font-mono tabular-nums", marginDel >= 0 ? "text-emerald-600" : "text-destructive")}>
                    {costsReady ? `฿${marginDel.toFixed(1)}` : "—"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
