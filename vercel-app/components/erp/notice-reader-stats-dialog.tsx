"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getNoticeOptions, getNoticeReaderStats, type NoticeReaderStatsRow } from "@/lib/api-client"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoStr(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NoticeReaderStatsDialog({ open, onOpenChange }: Props) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [statsStart, setStatsStart] = React.useState(() => daysAgoStr(30))
  const [statsEnd, setStatsEnd] = React.useState(() => todayStr())
  const [statsType, setStatsType] = React.useState<"all" | "notice" | "order">("all")
  const [statsStore, setStatsStore] = React.useState<string>("")
  const [statsStoreList, setStatsStoreList] = React.useState<string[]>([])
  const [statsMinMissed, setStatsMinMissed] = React.useState(1)
  const [statsItems, setStatsItems] = React.useState<NoticeReaderStatsRow[]>([])
  const [statsLoading, setStatsLoading] = React.useState(false)
  const [statsTruncated, setStatsTruncated] = React.useState(false)
  const [statsNoticeCount, setStatsNoticeCount] = React.useState(0)

  const loadStatsStores = React.useCallback(() => {
    if (!auth?.store) return
    const isOffice = auth.role === "director" || auth.role === "officer"
    getNoticeOptions()
      .then((r) => {
        const allLabel = t("noticeFilterAll")
        const list = isOffice ? (r.stores || []) : [auth.store!]
        setStatsStoreList([allLabel, ...list].filter(Boolean))
        if (!isOffice) {
          setStatsStore((prev) => (prev && prev !== allLabel ? prev : auth.store!))
        }
      })
      .catch(() => {
        if (auth?.store) {
          setStatsStoreList([t("noticeFilterAll"), auth.store])
        }
      })
  }, [auth?.store, auth?.role, auth, t])

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      onOpenChange(next)
      if (next) {
        setStatsEnd(todayStr())
        loadStatsStores()
      }
    },
    [onOpenChange, loadStatsStores]
  )

  const runReaderStats = React.useCallback(async () => {
    setStatsLoading(true)
    const allL = t("noticeFilterAll")
    const storeParam = !statsStore || statsStore === allL || statsStore === "All" ? undefined : statsStore
    const minM = Math.max(1, Math.min(100, Math.floor(statsMinMissed) || 1))
    setStatsMinMissed(minM)
    try {
      const res = await getNoticeReaderStats({
        startDate: statsStart,
        endDate: statsEnd,
        store: storeParam,
        searchType: statsType,
        minMissed: minM,
      })
      if (!res.success && res.message) {
        setStatsItems([])
        setStatsTruncated(false)
        setStatsNoticeCount(0)
        return
      }
      setStatsItems(res.items)
      setStatsTruncated(res.truncated)
      setStatsNoticeCount(res.noticeInRange)
    } catch {
      setStatsItems([])
      setStatsTruncated(false)
      setStatsNoticeCount(0)
    } finally {
      setStatsLoading(false)
    }
  }, [statsStart, statsEnd, statsType, statsStore, statsMinMissed, t])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col gap-3 p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base pr-6">{t("noticeReaderStatsTitle")}</DialogTitle>
          <p className="text-left text-xs text-muted-foreground font-normal">
            {t("noticeReaderStatsDesc")}
          </p>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
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
                {statsStoreList.length === 0 ? (
                  <SelectItem value={t("noticeFilterAll")}>{t("noticeFilterAll")}</SelectItem>
                ) : (
                  statsStoreList.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))
                )}
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
              {t("noticeReaderStatsMinMiss")}
            </span>
            <Input
              type="number"
              min={1}
              max={99}
              value={statsMinMissed}
              onChange={(e) =>
                setStatsMinMissed(
                  Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1)))
                )
              }
              className="h-9 text-xs w-full"
            />
          </div>
        </div>
        <Button
          type="button"
          className="h-9 w-full sm:w-auto"
          onClick={runReaderStats}
          disabled={statsLoading}
        >
          {statsLoading ? t("loading") : t("noticeReaderStatsRun")}
        </Button>
        {statsTruncated && (
          <p className="text-[10px] text-amber-600 dark:text-amber-500">
            {t("noticeReaderStatsTruncated")}
          </p>
        )}
        {statsNoticeCount > 0 && !statsLoading && (
          <p className="text-[10px] text-muted-foreground">
            {t("noticeCountPrefix")} {statsNoticeCount} {t("noticeCountSuffix")}
          </p>
        )}
        <div className="overflow-auto min-h-0 max-h-[min(52vh,28rem)] -mx-1 border rounded-md">
          {statsLoading ? (
            <div className="py-10 text-center text-sm text-muted-foreground">{t("loading")}</div>
          ) : statsItems.length === 0 ? (
            <div className="py-10 px-2 text-center text-sm text-muted-foreground">
              {t("noticeReaderStatsEmpty")}
            </div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-muted/90 backdrop-blur z-[1]">
                <tr className="border-b">
                  <th className="p-2 text-left font-medium">{t("noticeReaderStatsColStore")}</th>
                  <th className="p-2 text-left font-medium">{t("noticeReaderStatsColName")}</th>
                  <th className="p-2 text-left font-medium hidden sm:table-cell">
                    {t("noticeReaderStatsColJob")}
                  </th>
                  <th className="p-2 text-right font-medium tabular-nums">{t("noticeReaderStatsColTarget")}</th>
                  <th className="p-2 text-right font-medium tabular-nums text-[hsl(152,60%,42%)]">
                    {t("noticeReaderStatsColOk")}
                  </th>
                  <th className="p-2 text-right font-medium tabular-nums text-[hsl(38,92%,50%)]">
                    {t("noticeReaderStatsColMiss")}
                  </th>
                  <th className="p-2 text-right font-medium tabular-nums w-16">
                    {t("noticeReaderStatsColRate")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {statsItems.map((row) => (
                  <tr
                    key={`${row.store}-${row.name}`}
                    className="border-b border-border/60"
                  >
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
                    <td className="p-2 text-right tabular-nums text-muted-foreground">{row.targeted}</td>
                    <td className="p-2 text-right tabular-nums text-[hsl(152,60%,42%)]">
                      {row.confirmed}
                    </td>
                    <td className="p-2 text-right tabular-nums text-[hsl(38,92%,50%)]">{row.missed}</td>
                    <td className="p-2 text-right tabular-nums w-16">{row.missRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
