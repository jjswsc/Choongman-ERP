"use client"

import * as React from "react"
import { Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translatePosMenuLineForReceipt } from "@/lib/pos-print-translate"
import { getPosCostAnalysisAudit, type PosCostAnalysisAuditRow } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { ADMIN_TABLE_SCROLL_CN } from "@/lib/admin-ui-standards"
import { addBangkokCalendarDays, getBangkokTodayDateString } from "@/lib/bangkok-time"

type Props = {
  allowed: boolean
}

function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—"
  return v.toFixed(digits)
}

function diffCell(before: number | null | undefined, after: number | null | undefined) {
  const b = before ?? null
  const a = after ?? null
  if (b == null && a == null) return "—"
  if (b != null && a != null && Math.abs(b - a) < 1e-9) return fmtNum(a)
  return (
    <span className="tabular-nums">
      <span className="text-muted-foreground line-through">{b != null ? fmtNum(b) : "—"}</span>
      <span className="mx-1">→</span>
      <span className="font-medium">{a != null ? fmtNum(a) : "—"}</span>
    </span>
  )
}

export function PosCostAuditPanel({ allowed }: Props) {
  const { lang } = useLang()
  const t = useT(lang)
  const todayBkk = React.useMemo(() => getBangkokTodayDateString(), [])
  const [auditRows, setAuditRows] = React.useState<PosCostAnalysisAuditRow[]>([])
  const [auditLoading, setAuditLoading] = React.useState(false)
  const [auditQueried, setAuditQueried] = React.useState(false)
  const [auditSearchTerm, setAuditSearchTerm] = React.useState("")
  const [auditActionFilter, setAuditActionFilter] = React.useState<"all" | "insert" | "update" | "delete">("all")
  const [auditActorFilter, setAuditActorFilter] = React.useState("all")
  const [auditDatePreset, setAuditDatePreset] = React.useState<"today" | "7d" | "30d" | "custom">("today")
  const [auditStartDate, setAuditStartDate] = React.useState("")
  const [auditEndDate, setAuditEndDate] = React.useState("")

  React.useEffect(() => {
    if (!todayBkk) return
    if (auditDatePreset === "today") {
      setAuditStartDate(todayBkk)
      setAuditEndDate(todayBkk)
      return
    }
    if (auditDatePreset === "7d") {
      setAuditStartDate(addBangkokCalendarDays(todayBkk, -6))
      setAuditEndDate(todayBkk)
      return
    }
    if (auditDatePreset === "30d") {
      setAuditStartDate(addBangkokCalendarDays(todayBkk, -29))
      setAuditEndDate(todayBkk)
    }
  }, [auditDatePreset, todayBkk])

  const loadAudit = React.useCallback(async () => {
    if (!allowed) return
    setAuditLoading(true)
    try {
      const rows = await getPosCostAnalysisAudit({
        limit: 1000,
        startDate: auditStartDate || undefined,
        endDate: auditEndDate || undefined,
      })
      setAuditRows(Array.isArray(rows) ? rows : [])
      setAuditQueried(true)
    } catch {
      setAuditRows([])
      setAuditQueried(false)
    } finally {
      setAuditLoading(false)
    }
  }, [allowed, auditEndDate, auditStartDate])

  const filteredAuditRows = React.useMemo(() => {
    const q = auditSearchTerm.trim().toLowerCase()
    return auditRows.filter((r) => {
      const matchAction = auditActionFilter === "all" || r.actionType === auditActionFilter
      const actorKey = String(r.actorName || "").trim() || "-"
      const matchActor = auditActorFilter === "all" || actorKey === auditActorFilter
      if (!matchAction || !matchActor) return false
      if (!q) return true
      const hay = [
        r.menuCode,
        r.menuName,
        r.optionCode,
        r.optionName,
        r.itemCode,
        r.itemName,
        r.actorName,
        r.actorStore,
        r.actorRole,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .join(" ")
      const terms = q.split(/\s+/).filter(Boolean)
      return terms.every((term) => hay.includes(term))
    })
  }, [auditRows, auditSearchTerm, auditActionFilter, auditActorFilter])

  const auditActorOptions = React.useMemo(() => {
    const names = Array.from(
      new Set(auditRows.map((r) => String(r.actorName || "").trim() || "-").filter(Boolean))
    )
    return names.sort((a, b) => a.localeCompare(b, "ko"))
  }, [auditRows])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Select
          value={auditDatePreset}
          onValueChange={(v) => {
            setAuditDatePreset(v as "today" | "7d" | "30d" | "custom")
            setAuditQueried(false)
          }}
        >
          <SelectTrigger className="h-9 w-32 text-xs">
            <SelectValue placeholder={t("date")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">{t("today")}</SelectItem>
            <SelectItem value="7d">{t("last7Days")}</SelectItem>
            <SelectItem value="30d">{t("last30Days")}</SelectItem>
            <SelectItem value="custom">{t("custom")}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={auditStartDate}
          onChange={(e) => {
            setAuditDatePreset("custom")
            setAuditStartDate(e.target.value)
            setAuditQueried(false)
          }}
          className="h-9 w-40 text-xs"
        />
        <span className="text-xs text-muted-foreground">~</span>
        <Input
          type="date"
          value={auditEndDate}
          onChange={(e) => {
            setAuditDatePreset("custom")
            setAuditEndDate(e.target.value)
            setAuditQueried(false)
          }}
          className="h-9 w-40 text-xs"
        />
        <Select
          value={auditActionFilter}
          onValueChange={(v) => setAuditActionFilter(v as "all" | "insert" | "update" | "delete")}
        >
          <SelectTrigger className="h-9 w-32 text-xs">
            <SelectValue placeholder={t("status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            <SelectItem value="insert">{t("create")}</SelectItem>
            <SelectItem value="update">{t("edit")}</SelectItem>
            <SelectItem value="delete">{t("delete")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={auditActorFilter} onValueChange={setAuditActorFilter}>
          <SelectTrigger className="h-9 w-40 text-xs">
            <SelectValue placeholder={t("manager")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all")}</SelectItem>
            {auditActorOptions.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={auditSearchTerm}
            onChange={(e) => setAuditSearchTerm(e.target.value)}
            placeholder={t("posCostAuditSearchPh")}
            className="h-9 pl-9 pr-9 text-sm"
          />
          {auditSearchTerm ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 p-0"
              onClick={() => setAuditSearchTerm("")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          ) : null}
        </div>
        <Button size="sm" className="h-9 gap-1.5 px-4 text-xs font-semibold" onClick={loadAudit} disabled={auditLoading}>
          <Search className={cn("h-3.5 w-3.5", auditLoading && "animate-pulse")} />
          {auditLoading ? t("loading") : t("posCostBtnQuery")}
        </Button>
      </div>

      {auditLoading ? (
        <div className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
          {t("loading")}
        </div>
      ) : !auditQueried ? (
        <div className="rounded-xl border bg-muted/30 px-6 py-12 text-center text-sm text-muted-foreground">
          {t("posCostAuditHint")}
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className={cn(ADMIN_TABLE_SCROLL_CN, "max-h-[min(65vh,800px)]")}>
            <table className="w-full text-sm min-w-[960px]">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
                <tr className="border-b">
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("dateTime")}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("posMenuCode")}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("posMenuIngredients")}</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">{t("posCostQty")}</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold">{t("posIngredientLoss")}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("posCostIngredientType")}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("status")}</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold">{t("manager")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredAuditRows.map((r) => {
                  const isUpdate = r.actionType === "update"
                  const bQty = r.beforeQuantity
                  const aQty = r.afterQuantity ?? r.quantity
                  const bLoss = r.beforeLossRate
                  const aLoss = r.afterLossRate ?? r.lossRate
                  return (
                    <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/20">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums text-xs">{r.changedAt || "-"}</td>
                      <td className="px-3 py-2 text-xs">
                        <div className="font-mono">{r.menuCode || "-"}</div>
                        <div className="text-muted-foreground">
                          {r.menuName || "-"}
                          {r.optionName ? ` (${translatePosMenuLineForReceipt(r.optionName, t)})` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="font-mono">{r.itemCode || "-"}</div>
                        <div className="text-muted-foreground">{r.itemName || "-"}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        {isUpdate ? diffCell(bQty, aQty) : fmtNum(aQty)}
                      </td>
                      <td className="px-3 py-2 text-right text-xs">
                        {isUpdate ? diffCell(bLoss, aLoss) : (aLoss ?? 0) > 0 ? `${fmtNum(aLoss)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {!r.ingredientType
                          ? "-"
                          : r.ingredientType === "packaging"
                            ? t("posCostTypePackaging")
                            : t("posCostTypeFood")}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {r.actionType === "insert"
                          ? t("create")
                          : r.actionType === "update"
                            ? t("edit")
                            : r.actionType === "delete"
                              ? t("delete")
                              : r.actionType}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div>{r.actorName || "-"}</div>
                        <div className="text-muted-foreground">
                          {[r.actorRole, r.actorStore].filter(Boolean).join(" · ") || "-"}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filteredAuditRows.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-muted-foreground">{t("posCostNoData")}</div>
          ) : null}
        </div>
      )}
    </div>
  )
}
