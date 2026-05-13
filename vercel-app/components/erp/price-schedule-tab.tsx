"use client"

import * as React from "react"
import { CalendarClock, RefreshCw, XCircle, PlayCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { appAlert, appConfirm } from "@/lib/app-message"
import {
  getAdminItems,
  getItemCategories,
  getPosMenus,
  getPosMenuCategoriesConfig,
  getPriceSchedules,
  savePriceSchedule,
  cancelPriceSchedule,
  applyDuePriceSchedules,
  type PriceScheduleRow,
} from "@/lib/api-client"
import { useLang } from "@/lib/lang-context"
import { tr, useT } from "@/lib/i18n"

type PriceScheduleEntity = "item" | "pos_menu"

export interface PriceScheduleTabProps {
  mode: PriceScheduleEntity
  canManage: boolean
}

function displayLocaleForLang(lang: string): string {
  if (lang === "th") return "th-TH"
  if (lang === "mm") return "my-MM"
  if (lang === "lo") return "lo-LA"
  if (lang === "en") return "en-US"
  return "ko-KR"
}

function utcIsoToBangkokText(iso: string, locale: string): string {
  if (!iso) return "-"
  try {
    return new Date(iso).toLocaleString(locale, {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
  } catch {
    return iso
  }
}

function bangkokLocalToUtcIso(localDateTime: string): string {
  const [datePart, timePart] = String(localDateTime || "").split("T")
  if (!datePart || !timePart) return ""
  const [y, m, d] = datePart.split("-").map(Number)
  const [hh, mm] = timePart.split(":").map(Number)
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return ""
  // 사용자 입력을 방콕 로컬 시간으로 간주하고 UTC로 변환한다.
  return new Date(Date.UTC(y, m - 1, d, hh - 7, mm, 0, 0)).toISOString()
}

function nextHourBangkokLocalInput(): string {
  const now = new Date()
  const bkk = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }))
  bkk.setMinutes(0, 0, 0)
  bkk.setHours(bkk.getHours() + 1)
  const yyyy = bkk.getFullYear()
  const mm = String(bkk.getMonth() + 1).padStart(2, "0")
  const dd = String(bkk.getDate()).padStart(2, "0")
  const hh = String(bkk.getHours()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}T${hh}:00`
}

export function PriceScheduleTab({ mode, canManage }: PriceScheduleTabProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const locale = displayLocaleForLang(lang)
  const [rows, setRows] = React.useState<PriceScheduleRow[]>([])
  const [loading, setLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [applying, setApplying] = React.useState(false)
  const [statusFilter, setStatusFilter] = React.useState<"all" | "pending" | "applied" | "cancelled" | "failed">("pending")
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("all")
  const [entityId, setEntityId] = React.useState("")
  const [itemSell, setItemSell] = React.useState("")
  const [itemCost, setItemCost] = React.useState("")
  const [menuHall, setMenuHall] = React.useState("")
  const [menuDelivery, setMenuDelivery] = React.useState("")
  const [effectiveAtLocal, setEffectiveAtLocal] = React.useState(nextHourBangkokLocalInput())
  const [itemOptions, setItemOptions] = React.useState<{ id: string; label: string; category: string }[]>([])
  const [categoryOptions, setCategoryOptions] = React.useState<string[]>([])

  const scheduledFieldLabel = React.useCallback(
    (field: string) => {
      if (mode === "item") {
        if (field === "price") return t("priceScheduleFieldItemSell")
        if (field === "cost") return t("priceScheduleFieldItemCost")
      } else {
        if (field === "price") return t("priceScheduleFieldMenuHall")
        if (field === "price_delivery") return t("priceScheduleFieldMenuDelivery")
      }
      return field
    },
    [mode, t]
  )

  const loadEntityOptions = React.useCallback(async () => {
    if (mode === "item") {
      const [items, categoryRes] = await Promise.all([getAdminItems(), getItemCategories()])
      const categories = (categoryRes?.categories || []).filter(Boolean).sort()
      setCategoryOptions(categories)
      setItemOptions(
        (items || [])
          .map((x) => ({
            id: String(x.code || ""),
            label: `${x.code} ${x.name}`,
            category: String(x.category || "").trim(),
          }))
          .filter((x) => x.id)
      )
      return
    }
    const [menus, categoriesConfig] = await Promise.all([getPosMenus(), getPosMenuCategoriesConfig()])
    const categoryMap = categoriesConfig?.categoriesByMain || {}
    const categories = Array.from(new Set(Object.values(categoryMap).flat().filter(Boolean))).sort()
    setCategoryOptions(categories)
    setItemOptions(
      (menus || [])
        .map((x) => ({
          id: String(x.id || ""),
          label: `${x.code || x.id} ${x.name}`,
          category: String(x.category || "").trim(),
        }))
        .filter((x) => x.id)
    )
  }, [mode])

  const loadSchedules = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await getPriceSchedules({
        entityType: mode,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: searchTerm.trim() || undefined,
        category: categoryFilter !== "all" ? categoryFilter : undefined,
        limit: 300,
      })
      setRows(data)
    } finally {
      setLoading(false)
    }
  }, [mode, statusFilter, searchTerm, categoryFilter])

  const filteredEntityOptions = React.useMemo(() => {
    if (categoryFilter === "all") return itemOptions
    return itemOptions.filter((x) => (x.category || "").trim() === categoryFilter)
  }, [itemOptions, categoryFilter])

  React.useEffect(() => {
    if (!entityId) return
    if (!filteredEntityOptions.some((x) => x.id === entityId)) {
      setEntityId("")
    }
  }, [entityId, filteredEntityOptions])

  React.useEffect(() => {
    loadEntityOptions().catch(() => setItemOptions([]))
  }, [loadEntityOptions])

  React.useEffect(() => {
    loadSchedules().catch(() => setRows([]))
  }, [loadSchedules])

  const handleSave = React.useCallback(async () => {
    if (!canManage) {
      await appAlert(t("priceScheduleAlertOfficeOnly"))
      return
    }
    if (!entityId) {
      await appAlert(t("priceScheduleAlertSelectTarget"))
      return
    }
    const pairs: { fieldName: string; raw: string }[] =
      mode === "item"
        ? [
            { fieldName: "price", raw: itemSell },
            { fieldName: "cost", raw: itemCost },
          ]
        : [
            { fieldName: "price", raw: menuHall },
            { fieldName: "price_delivery", raw: menuDelivery },
          ]
    const toSave: { fieldName: string; scheduledValue: number }[] = []
    for (const { fieldName, raw } of pairs) {
      const trimmed = String(raw ?? "").trim()
      if (!trimmed) continue
      const n = Number(trimmed)
      if (!Number.isFinite(n) || n < 0) {
        await appAlert(t("priceScheduleAlertInvalidPrice"))
        return
      }
      toSave.push({ fieldName, scheduledValue: n })
    }
    if (toSave.length === 0) {
      await appAlert(t("priceScheduleAlertEnterAtLeastOne"))
      return
    }
    const effectiveAt = bangkokLocalToUtcIso(effectiveAtLocal)
    if (!effectiveAt) {
      await appAlert(t("priceScheduleAlertCheckEffectiveAt"))
      return
    }
    setSaving(true)
    try {
      for (const row of toSave) {
        const r = await savePriceSchedule({
          entityType: mode,
          entityId,
          fieldName: row.fieldName,
          scheduledValue: row.scheduledValue,
          effectiveAt,
        })
        if (!r.success) {
          await appAlert(r.message || t("priceScheduleAlertSaveFailed"))
          return
        }
      }
      if (mode === "item") {
        setItemSell("")
        setItemCost("")
      } else {
        setMenuHall("")
        setMenuDelivery("")
      }
      await loadSchedules()
      await appAlert(t("priceScheduleAlertRegistered"))
    } finally {
      setSaving(false)
    }
  }, [canManage, entityId, itemSell, itemCost, menuHall, menuDelivery, effectiveAtLocal, mode, loadSchedules, t])

  const handleCancel = React.useCallback(async (id: number) => {
    if (!canManage) return
    if (!await appConfirm(t("priceScheduleConfirmCancel"))) return
    const r = await cancelPriceSchedule({ id })
    if (!r.success) {
      await appAlert(r.message || t("priceScheduleAlertCancelFailed"))
      return
    }
    await loadSchedules()
  }, [canManage, loadSchedules, t])

  const handleApplyDue = React.useCallback(async () => {
    if (!canManage) return
    if (!await appConfirm(t("priceScheduleConfirmApplyDue"))) return
    setApplying(true)
    try {
      const r = await applyDuePriceSchedules()
      if (!r.success) {
        await appAlert(r.message || t("priceScheduleAlertApplyFailed"))
        return
      }
      await loadSchedules()
      await appAlert(tr(t, "priceScheduleAlertApplyDone", { applied: r.appliedCount ?? 0, failed: r.failedCount ?? 0 }))
    } finally {
      setApplying(false)
    }
  }, [canManage, loadSchedules, t])

  const statusLabel = React.useCallback(
    (s: string) => {
      if (s === "pending") return t("priceScheduleStatusPending")
      if (s === "applied") return t("priceScheduleStatusApplied")
      if (s === "cancelled") return t("priceScheduleStatusCancelled")
      if (s === "failed") return t("priceScheduleStatusFailed")
      return s
    },
    [t]
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue placeholder={t("priceScheduleStatusPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("priceScheduleStatusAll")}</SelectItem>
            <SelectItem value="pending">{t("priceScheduleStatusPending")}</SelectItem>
            <SelectItem value="applied">{t("priceScheduleStatusApplied")}</SelectItem>
            <SelectItem value="cancelled">{t("priceScheduleStatusCancelled")}</SelectItem>
            <SelectItem value="failed">{t("priceScheduleStatusFailed")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-[150px] text-xs">
            <SelectValue placeholder={t("priceScheduleCategoryPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("priceScheduleCategoryAll")}</SelectItem>
            {categoryOptions.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-9 w-[220px] text-sm"
          placeholder={mode === "item" ? t("priceScheduleSearchItemPh") : t("priceScheduleSearchMenuPh")}
        />
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => void loadSchedules()} disabled={loading}>
          <RefreshCw className="h-3.5 w-3.5" />
          {loading ? t("priceScheduleRefreshing") : t("priceScheduleBtnRefresh")}
        </Button>
        {canManage && (
          <Button size="sm" variant="secondary" className="h-9 gap-1.5" onClick={handleApplyDue} disabled={applying}>
            <PlayCircle className="h-3.5 w-3.5" />
            {applying ? t("priceScheduleApplying") : t("priceScheduleBtnApplyDue")}
          </Button>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" />
          {t("priceScheduleSectionTitle")}
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <div className="min-w-0 xl:col-span-2">
            <Select value={entityId} onValueChange={setEntityId} disabled={!canManage}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder={mode === "item" ? t("priceScheduleSelectItem") : t("priceScheduleSelectMenu")} />
              </SelectTrigger>
              <SelectContent>
                {filteredEntityOptions.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {mode === "item" ? (
            <>
              <Input
                value={itemSell}
                onChange={(e) => setItemSell(e.target.value)}
                type="number"
                min={0}
                step="0.01"
                className="h-9 text-sm"
                placeholder={t("priceScheduleFieldItemSell")}
                disabled={!canManage}
              />
              <Input
                value={itemCost}
                onChange={(e) => setItemCost(e.target.value)}
                type="number"
                min={0}
                step="0.01"
                className="h-9 text-sm"
                placeholder={t("priceScheduleFieldItemCost")}
                disabled={!canManage}
              />
            </>
          ) : (
            <>
              <Input
                value={menuHall}
                onChange={(e) => setMenuHall(e.target.value)}
                type="number"
                min={0}
                step="0.01"
                className="h-9 text-sm"
                placeholder={t("priceScheduleFieldMenuHall")}
                disabled={!canManage}
              />
              <Input
                value={menuDelivery}
                onChange={(e) => setMenuDelivery(e.target.value)}
                type="number"
                min={0}
                step="0.01"
                className="h-9 text-sm"
                placeholder={t("priceScheduleFieldMenuDelivery")}
                disabled={!canManage}
              />
            </>
          )}
          <Input
            value={effectiveAtLocal}
            onChange={(e) => setEffectiveAtLocal(e.target.value)}
            type="datetime-local"
            className="h-9 text-sm"
            disabled={!canManage}
          />
          <Button className="h-9" onClick={handleSave} disabled={!canManage || saving}>
            {saving ? t("priceScheduleSaving") : t("priceScheduleBtnSave")}
          </Button>
        </div>
        {!canManage && (
          <p className="text-xs text-muted-foreground">{t("priceScheduleStoreViewOnlyHint")}</p>
        )}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2 text-left">{t("priceScheduleColTarget")}</th>
                <th className="px-3 py-2 text-left">{t("priceScheduleColField")}</th>
                <th className="px-3 py-2 text-right">{t("priceScheduleColScheduledPrice")}</th>
                <th className="px-3 py-2 text-left">{t("priceScheduleColEffectiveBangkok")}</th>
                <th className="px-3 py-2 text-left">{t("priceScheduleColStatus")}</th>
                <th className="px-3 py-2 text-left">{t("priceScheduleColAction")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{r.entity_display_name || r.entity_id}</td>
                  <td className="px-3 py-2">{scheduledFieldLabel(String(r.field_name || ""))}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.scheduled_value || 0).toLocaleString(locale)}</td>
                  <td className="px-3 py-2">{utcIsoToBangkokText(r.effective_at, locale)}</td>
                  <td className="px-3 py-2">{statusLabel(r.status)}</td>
                  <td className="px-3 py-2">
                    {canManage && r.status === "pending" ? (
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void handleCancel(r.id)}>
                        <XCircle className="h-3.5 w-3.5 mr-1" />
                        {t("priceScheduleRowCancel")}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-muted-foreground">
                    {t("priceScheduleEmpty")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
