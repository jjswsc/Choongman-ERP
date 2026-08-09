"use client"

import * as React from "react"
import { ChevronDown, ChevronRight, UserX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  applyNoticeUnreadAllowanceExclusion,
  getNoticeOptions,
  getNoticeReaderStats,
  getNoticeUnreadForEmployee,
  listNoticeUnreadAllowanceExclusions,
  type NoticeReaderStatsRow,
  type NoticeUnreadDetailItem,
} from "@/lib/api-client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { bangkokInclusivePeriod, bangkokTodayYmd } from "@/lib/bangkok-date"
import { cn } from "@/lib/utils"

function empKey(store: string, name: string) {
  return `${store}|${name}`
}

function defaultPayrollMonth(): string {
  return bangkokTodayYmd().slice(0, 7)
}

export function AdminNoticeUnread() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const defaultRange = React.useMemo(() => bangkokInclusivePeriod(bangkokTodayYmd(), 30), [])
  const [statsStart, setStatsStart] = React.useState(defaultRange.startYmd)
  const [statsEnd, setStatsEnd] = React.useState(defaultRange.endYmd)
  const [statsType, setStatsType] = React.useState<"all" | "notice" | "order">("notice")
  const [statsStore, setStatsStore] = React.useState<string>("")
  const [statsStoreList, setStatsStoreList] = React.useState<string[]>([])
  const [statsMinMissed, setStatsMinMissed] = React.useState(1)
  /** 발송 후 N일 이상 미확인만 (0=제한 없음, 기본 3일) */
  const [minUnreadDays, setMinUnreadDays] = React.useState(3)
  const [statsItems, setStatsItems] = React.useState<NoticeReaderStatsRow[]>([])
  const [statsLoading, setStatsLoading] = React.useState(false)
  const [statsTruncated, setStatsTruncated] = React.useState(false)
  const [statsNoticeCount, setStatsNoticeCount] = React.useState(0)

  const [selected, setSelected] = React.useState<Set<string>>(() => new Set())
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set())
  const [detailByKey, setDetailByKey] = React.useState<
    Record<string, { loading: boolean; items: NoticeUnreadDetailItem[]; error?: string }>
  >({})

  const [payrollMonth, setPayrollMonth] = React.useState(defaultPayrollMonth)
  const [excludedKeys, setExcludedKeys] = React.useState<Set<string>>(() => new Set())
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [confirmMode, setConfirmMode] = React.useState<"apply" | "remove">("apply")
  const [applying, setApplying] = React.useState(false)
  const [actionMsg, setActionMsg] = React.useState("")

  const loadStores = React.useCallback(() => {
    if (!auth?.store) return
    const isOffice = auth.role === "director" || auth.role === "secretary" || auth.role === "officer"
    getNoticeOptions()
      .then((r) => {
        const allLabel = t("noticeFilterAll")
        const list = isOffice ? r.stores || [] : [auth.store!]
        setStatsStoreList([allLabel, ...list].filter(Boolean))
        if (!isOffice) {
          setStatsStore((prev) => (prev && prev !== allLabel ? prev : auth.store!))
        } else if (!statsStore) {
          setStatsStore(allLabel)
        }
      })
      .catch(() => {
        if (auth?.store) setStatsStoreList([t("noticeFilterAll"), auth.store])
      })
  }, [auth?.store, auth?.role, auth, t, statsStore])

  React.useEffect(() => {
    loadStores()
  }, [loadStores])

  const loadExclusions = React.useCallback(async (month: string) => {
    try {
      const res = await listNoticeUnreadAllowanceExclusions({ payrollMonth: month })
      const set = new Set<string>()
      for (const row of res.items || []) {
        const s = String(row.store || "").trim()
        const n = String(row.name || "").trim()
        if (s && n) set.add(empKey(s, n))
      }
      setExcludedKeys(set)
    } catch {
      setExcludedKeys(new Set())
    }
  }, [])

  React.useEffect(() => {
    void loadExclusions(payrollMonth)
  }, [payrollMonth, loadExclusions])

  const runReaderStats = React.useCallback(async () => {
    setStatsLoading(true)
    setActionMsg("")
    const allL = t("noticeFilterAll")
    const storeParam =
      !statsStore || statsStore === allL || statsStore === "All" ? undefined : statsStore
    const minM = Math.max(1, Math.min(100, Math.floor(statsMinMissed) || 1))
    setStatsMinMissed(minM)
    try {
      const res = await getNoticeReaderStats({
        startDate: statsStart,
        endDate: statsEnd,
        store: storeParam,
        searchType: statsType,
        minMissed: minM,
        minUnreadDays,
      })
      if (!res.success && res.message) {
        setStatsItems([])
        setStatsTruncated(false)
        setStatsNoticeCount(0)
        setActionMsg(res.message)
        return
      }
      setStatsItems(res.items)
      setStatsTruncated(res.truncated)
      setStatsNoticeCount(res.noticeInRange)
      setSelected(new Set())
      setExpanded(new Set())
      setDetailByKey({})
    } catch (e) {
      setStatsItems([])
      setActionMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setStatsLoading(false)
    }
  }, [statsStart, statsEnd, statsType, statsStore, statsMinMissed, minUnreadDays, t])

  const toggleExpand = React.useCallback(
    async (row: NoticeReaderStatsRow) => {
      const key = empKey(row.store, row.name)
      const willOpen = !expanded.has(key)
      setExpanded((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
      })
      if (!willOpen) return
      if (detailByKey[key] != null && !detailByKey[key].loading) return
      setDetailByKey((prev) => ({ ...prev, [key]: { loading: true, items: [] } }))
      try {
        const res = await getNoticeUnreadForEmployee({
          store: row.store,
          name: row.name,
          startDate: statsStart,
          endDate: statsEnd,
          searchType: statsType,
          minUnreadDays,
        })
        setDetailByKey((prev) => ({
          ...prev,
          [key]: {
            loading: false,
            items: res.items,
            error: res.success ? undefined : res.message,
          },
        }))
      } catch (e) {
        setDetailByKey((prev) => ({
          ...prev,
          [key]: {
            loading: false,
            items: [],
            error: e instanceof Error ? e.message : String(e),
          },
        }))
      }
    },
    [detailByKey, expanded, statsStart, statsEnd, statsType, minUnreadDays]
  )

  const toggleSelect = (row: NoticeReaderStatsRow, checked: boolean) => {
    const key = empKey(row.store, row.name)
    setSelected((prev) => {
      const next = new Set(prev)
      if (checked) next.add(key)
      else next.delete(key)
      return next
    })
  }

  const toggleSelectAll = (checked: boolean) => {
    if (!checked) {
      setSelected(new Set())
      return
    }
    setSelected(new Set(statsItems.map((r) => empKey(r.store, r.name))))
  }

  const selectedRows = statsItems.filter((r) => selected.has(empKey(r.store, r.name)))

  const openConfirm = (mode: "apply" | "remove") => {
    if (selectedRows.length === 0) return
    setConfirmMode(mode)
    setConfirmOpen(true)
  }

  const runExclusion = async () => {
    setApplying(true)
    setActionMsg("")
    try {
      const employees = selectedRows.map((r) => {
        const key = empKey(r.store, r.name)
        const detail = detailByKey[key]?.items
        return {
          store: r.store,
          name: r.name,
          missedCount: r.missed,
          noticeIds: detail?.map((d) => d.id),
        }
      })
      const res = await applyNoticeUnreadAllowanceExclusion({
        action: confirmMode,
        payrollMonth,
        periodStart: statsStart,
        periodEnd: statsEnd,
        employees,
      })
      setActionMsg(res.message || (res.success ? t("noticeUnreadPenaltyDone") : t("noticeUnreadPenaltyFail")))
      if (res.success) {
        setConfirmOpen(false)
        await loadExclusions(payrollMonth)
      }
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setApplying(false)
    }
  }

  const exportCsv = () => {
    if (statsItems.length === 0) return
    const header = [
      t("noticeReaderStatsColStore"),
      t("noticeReaderStatsColName"),
      t("noticeReaderStatsColJob"),
      t("noticeReaderStatsColTarget"),
      t("noticeReaderStatsColOk"),
      t("noticeReaderStatsColMiss"),
      t("noticeReaderStatsColRate"),
      t("noticeUnreadExcludedCol"),
    ]
    const rows = statsItems.map((row) => {
      const key = empKey(row.store, row.name)
      return [
        row.store,
        row.name,
        row.job,
        row.targeted,
        row.confirmed,
        row.missed,
        `${row.missRate}%`,
        excludedKeys.has(key) ? "Y" : "",
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(",")
    })
    const csv = [header.map((h) => `"${h}"`).join(","), ...rows].join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `notice-unread-${statsStart}-${statsEnd}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const allSelected = statsItems.length > 0 && selected.size === statsItems.length

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <UserX className="h-4 w-4 text-warning" aria-hidden />
            {t("noticeUnreadTabTitle")}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">{t("noticeUnreadTabDesc")}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 text-xs">
          <div>
            <span className="text-[10px] text-muted-foreground block mb-1">
              {t("noticeReaderStatsRangeHint")}
            </span>
            <div className="flex items-center gap-1.5 flex-wrap">
              <Input
                type="date"
                value={statsStart}
                onChange={(e) => setStatsStart(e.target.value)}
                className="date-input-compact h-9 text-xs flex-1 min-w-[7rem]"
              />
              <span className="text-muted-foreground">~</span>
              <Input
                type="date"
                value={statsEnd}
                onChange={(e) => setStatsEnd(e.target.value)}
                className="date-input-compact h-9 text-xs flex-1 min-w-[7rem]"
              />
            </div>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground block mb-1">
              {t("stockFilterStore") || t("store")}
            </span>
            <Select value={statsStore || t("noticeFilterAll")} onValueChange={setStatsStore}>
              <SelectTrigger className="h-9 text-xs w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(statsStoreList.length === 0 ? [t("noticeFilterAll")] : statsStoreList).map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground block mb-1">
              {t("noticeReaderStatsTypeLabel")}
            </span>
            <Select
              value={statsType}
              onValueChange={(v) => setStatsType(v as "all" | "notice" | "order")}
            >
              <SelectTrigger className="h-9 text-xs w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("noticeReaderStatsTypeAll")}</SelectItem>
                <SelectItem value="notice">{t("noticeReaderStatsTypeNotice")}</SelectItem>
                <SelectItem value="order">{t("noticeReaderStatsTypeOrder")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground block mb-1">
              {t("noticeUnreadMinDaysLabel")}
            </span>
            <Select
              value={String(minUnreadDays)}
              onValueChange={(v) => setMinUnreadDays(Math.max(0, Math.floor(Number(v) || 0)))}
            >
              <SelectTrigger className="h-9 text-xs w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">{t("noticeUnreadMinDaysNone")}</SelectItem>
                <SelectItem value="1">{t("noticeUnreadMinDays1")}</SelectItem>
                <SelectItem value="3">{t("noticeUnreadMinDays3")}</SelectItem>
                <SelectItem value="5">{t("noticeUnreadMinDays5")}</SelectItem>
                <SelectItem value="7">{t("noticeUnreadMinDays7")}</SelectItem>
                <SelectItem value="14">{t("noticeUnreadMinDays14")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <span className="text-[10px] text-muted-foreground block mb-1">
              {t("noticeReaderStatsMinMiss")}
            </span>
            <Input
              type="number"
              min={1}
              max={99}
              value={statsMinMissed}
              onChange={(e) =>
                setStatsMinMissed(Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1))))
              }
              className="h-9 text-xs w-full"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <Button type="button" className="h-9" onClick={runReaderStats} disabled={statsLoading}>
            {statsLoading ? t("loading") : t("noticeReaderStatsRun")}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={exportCsv}
            disabled={statsLoading || statsItems.length === 0}
          >
            {t("noticeExportCsv")}
          </Button>
          <div className="flex items-center gap-2 ml-auto flex-wrap">
            <div>
              <span className="text-[10px] text-muted-foreground block mb-1">
                {t("noticeUnreadPayrollMonth")}
              </span>
              <Input
                type="month"
                value={payrollMonth}
                onChange={(e) => setPayrollMonth(e.target.value.slice(0, 7))}
                className="h-9 text-xs w-[10.5rem]"
              />
            </div>
            <Button
              type="button"
              variant="destructive"
              className="h-9"
              disabled={selectedRows.length === 0 || applying}
              onClick={() => openConfirm("apply")}
            >
              {t("noticeUnreadPenaltyApply")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9"
              disabled={selectedRows.length === 0 || applying}
              onClick={() => openConfirm("remove")}
            >
              {t("noticeUnreadPenaltyRemove")}
            </Button>
          </div>
        </div>

        {actionMsg ? <p className="text-xs text-muted-foreground">{actionMsg}</p> : null}
        {statsTruncated ? (
          <p className="text-[10px] text-amber-600 dark:text-amber-500">
            {t("noticeReaderStatsTruncated")}
          </p>
        ) : null}
        {statsNoticeCount > 0 && !statsLoading ? (
          <p className="text-[10px] text-muted-foreground">
            {t("noticeCountPrefix")} {statsNoticeCount} {t("noticeCountSuffix")} · {t("noticeUnreadSelectedCount")}{" "}
            {selectedRows.length}
          </p>
        ) : null}
      </div>

      <div className="overflow-auto border rounded-md min-h-[16rem]">
        {statsLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t("loading")}</div>
        ) : statsItems.length === 0 ? (
          <div className="py-12 px-2 text-center text-sm text-muted-foreground">
            {t("noticeReaderStatsEmpty")}
          </div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-muted/90 backdrop-blur z-[1]">
              <tr className="border-b">
                <th className="p-2 w-8">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(v) => toggleSelectAll(v === true)}
                    aria-label="select all"
                  />
                </th>
                <th className="p-2 w-8" />
                <th className="p-2 text-left font-medium">{t("noticeReaderStatsColStore")}</th>
                <th className="p-2 text-left font-medium">{t("noticeReaderStatsColName")}</th>
                <th className="p-2 text-left font-medium hidden sm:table-cell">
                  {t("noticeReaderStatsColJob")}
                </th>
                <th className="p-2 text-right font-medium tabular-nums">
                  {t("noticeReaderStatsColTarget")}
                </th>
                <th className="p-2 text-right font-medium tabular-nums text-[hsl(152,60%,42%)]">
                  {t("noticeReaderStatsColOk")}
                </th>
                <th className="p-2 text-right font-medium tabular-nums text-[hsl(38,92%,50%)]">
                  {t("noticeReaderStatsColMiss")}
                </th>
                <th className="p-2 text-right font-medium tabular-nums w-16">
                  {t("noticeReaderStatsColRate")}
                </th>
                <th className="p-2 text-left font-medium">{t("noticeUnreadExcludedCol")}</th>
              </tr>
            </thead>
            <tbody>
              {statsItems.map((row) => {
                const key = empKey(row.store, row.name)
                const isOpen = expanded.has(key)
                const detail = detailByKey[key]
                const isExcluded = excludedKeys.has(key)
                return (
                  <React.Fragment key={key}>
                    <tr className="border-b border-border/60 hover:bg-muted/40">
                      <td className="p-2">
                        <Checkbox
                          checked={selected.has(key)}
                          onCheckedChange={(v) => toggleSelect(row, v === true)}
                          aria-label={`select ${row.name}`}
                        />
                      </td>
                      <td className="p-2">
                        <button
                          type="button"
                          className="p-0.5 rounded hover:bg-muted"
                          onClick={() => void toggleExpand(row)}
                          aria-expanded={isOpen}
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </td>
                      <td className="p-2 max-w-[7rem] truncate" title={row.store}>
                        {row.store}
                      </td>
                      <td className="p-2 max-w-[6rem] truncate font-medium" title={row.name}>
                        {row.name}
                      </td>
                      <td
                        className="p-2 text-muted-foreground hidden sm:table-cell max-w-[5rem] truncate"
                        title={row.job}
                      >
                        {row.job}
                      </td>
                      <td className="p-2 text-right tabular-nums text-muted-foreground">
                        {row.targeted}
                      </td>
                      <td className="p-2 text-right tabular-nums text-[hsl(152,60%,42%)]">
                        {row.confirmed}
                      </td>
                      <td className="p-2 text-right tabular-nums text-[hsl(38,92%,50%)]">
                        {row.missed}
                      </td>
                      <td className="p-2 text-right tabular-nums w-16">{row.missRate}%</td>
                      <td className="p-2">
                        {isExcluded ? (
                          <span className="inline-flex rounded bg-destructive/10 text-destructive px-1.5 py-0.5 text-[10px] font-medium">
                            {t("noticeUnreadExcludedBadge")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-b border-border/40 bg-muted/20">
                        <td colSpan={10} className="p-3">
                          {detail?.loading ? (
                            <p className="text-muted-foreground">{t("loading")}</p>
                          ) : detail?.error ? (
                            <p className="text-destructive">{detail.error}</p>
                          ) : !detail?.items?.length ? (
                            <p className="text-muted-foreground">{t("noticeUnreadDetailEmpty")}</p>
                          ) : (
                            <ul className="space-y-1.5">
                              {detail.items.map((n) => (
                                <li
                                  key={n.id}
                                  className={cn(
                                    "flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] border-l-2 border-warning/60 pl-2"
                                  )}
                                >
                                  <span className="font-medium text-foreground">{n.title}</span>
                                  <span className="text-muted-foreground">
                                    {n.createdAt ? n.createdAt.slice(0, 16).replace("T", " ") : ""}
                                  </span>
                                  {n.sender ? (
                                    <span className="text-muted-foreground">
                                      {t("noticeSenderLabel")}: {n.sender}
                                    </span>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmMode === "apply"
                ? t("noticeUnreadPenaltyApply")
                : t("noticeUnreadPenaltyRemove")}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {confirmMode === "apply"
              ? t("noticeUnreadPenaltyConfirmApply")
                  .replace("{n}", String(selectedRows.length))
                  .replace("{month}", payrollMonth)
              : t("noticeUnreadPenaltyConfirmRemove")
                  .replace("{n}", String(selectedRows.length))
                  .replace("{month}", payrollMonth)}
          </p>
          <ul className="max-h-40 overflow-auto text-xs space-y-1 border rounded-md p-2">
            {selectedRows.slice(0, 40).map((r) => (
              <li key={empKey(r.store, r.name)}>
                {r.store} · {r.name} ({r.missed})
              </li>
            ))}
            {selectedRows.length > 40 ? <li>… +{selectedRows.length - 40}</li> : null}
          </ul>
          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              type="button"
              variant={confirmMode === "apply" ? "destructive" : "default"}
              disabled={applying}
              onClick={() => void runExclusion()}
            >
              {applying ? t("loading") : t("noticeUnreadPenaltyConfirmOk")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
