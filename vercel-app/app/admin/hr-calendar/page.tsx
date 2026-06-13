"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { useT } from "@/lib/i18n"
import { useLang, type LangCode } from "@/lib/lang-context"
import { useAuth } from "@/lib/auth-context"
import { getAdminEmployeeList, type AdminEmployeeItem } from "@/lib/api-client"
import {
  buildHrCalendarEvents,
  uniqueStoresFromEmployees,
  type HrCalendarEvent,
  type HrCalendarEventKind,
} from "@/lib/hr-calendar-events"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

const HR_CAL_KIND_ORDER: HrCalendarEventKind[] = ["birthday", "hire", "anniversary", "resign"]

/** 입사 년차 드롭다운 상한 (미선택 시 전체) */
const ANNIVERSARY_YEAR_MAX = 50

const defaultKindFlags = (): Record<HrCalendarEventKind, boolean> => ({
  birthday: true,
  hire: true,
  anniversary: true,
  resign: true,
})

function filterRowKindLabel(kind: HrCalendarEventKind, t: (k: string) => string): string {
  if (kind === "birthday") return t("hrCalTypeBirth")
  if (kind === "hire") return t("hrCalTypeHire")
  if (kind === "resign") return t("hrCalTypeResign")
  return t("hrCalWorkYearLegend")
}

/** 달력 월 기본값 — 방콕(Asia/Bangkok) 기준 */
function bangkokYearMonth(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date())
    const y = parts.find((p) => p.type === "year")?.value
    const mo = parts.find((p) => p.type === "month")?.value
    if (y && mo) return `${y}-${mo}`
  } catch {
    /* ignore */
  }
  return new Date().toISOString().slice(0, 7)
}

function bangkokTodayYmd(): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function shiftYearMonth(ym: string, deltaMonths: number): string {
  const [yy, mm] = ym.split("-").map(Number)
  const safeY = Number.isFinite(yy) ? yy : new Date().getFullYear()
  const safeM = Number.isFinite(mm) ? mm : 1
  const d = new Date(safeY, safeM - 1 + deltaMonths, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function formatEventTypeLabel(ev: HrCalendarEvent, t: (k: string) => string): string {
  if (ev.kind === "birthday") return t("hrCalTypeBirth")
  if (ev.kind === "hire") return t("hrCalTypeHire")
  if (ev.kind === "resign") return t("hrCalTypeResign")
  return t("hrCalWorkYearNth").replace("{n}", String(ev.anniversaryYears ?? ""))
}

function formatHrCalLabel(ev: HrCalendarEvent, t: (k: string) => string): string {
  const tag = formatEventTypeLabel(ev, t)
  return `[${tag}] ${ev.store} · ${ev.nick}`
}

function formatHrCalTooltip(ev: HrCalendarEvent, t: (k: string) => string): string {
  const line1 = formatHrCalLabel(ev, t)
  if (ev.legalName) {
    return `${line1}\n${t("hrCalTooltipLegalName").replace("{name}", ev.legalName)}`
  }
  return line1
}

function hrCalEmployeeHref(ev: HrCalendarEvent): string | null {
  const code = String(ev.employeeCode || "").trim()
  if (!code) return null
  const q = new URLSearchParams()
  q.set("employeeCode", code)
  if (ev.store && ev.store !== "—") q.set("store", ev.store)
  if (ev.employeeName) q.set("name", ev.employeeName)
  return `/admin/employees?${q.toString()}`
}

function eventKindSurface(kind: HrCalendarEventKind): string {
  return cn(
    "border border-black/[0.06] dark:border-white/[0.08]",
    kind === "birthday" &&
      "bg-rose-100/95 text-rose-950 shadow-sm dark:bg-rose-950/45 dark:text-rose-50",
    kind === "hire" && "bg-sky-100/95 text-sky-950 shadow-sm dark:bg-sky-950/45 dark:text-sky-50",
    kind === "anniversary" &&
      "bg-violet-100/95 text-violet-950 shadow-sm dark:bg-violet-950/45 dark:text-violet-50",
    kind === "resign" &&
      "bg-slate-200/95 text-slate-900 shadow-sm dark:bg-slate-800/80 dark:text-slate-100"
  )
}

const MONTH_LABEL_LOCALE: Record<LangCode, string> = {
  ko: "ko-KR",
  en: "en-US",
  th: "th-TH",
  mm: "my-MM",
  la: "lo-LA",
  kh: "km-KH",
  vi: "vi-VN",
  ms: "ms-MY",
}

function formatListDate(iso: string, lang: LangCode): string {
  const loc = MONTH_LABEL_LOCALE[lang] || "ko-KR"
  const p = iso.slice(0, 10).split("-").map(Number)
  if (p.length < 3 || !p[0]) return iso
  const [Y, Mo, D] = p
  try {
    return new Intl.DateTimeFormat(loc, {
      month: "short",
      day: "numeric",
      weekday: "short",
    }).format(new Date(Y, Mo - 1, D))
  } catch {
    return iso.slice(0, 10)
  }
}

export default function AdminHrCalendarPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const { auth } = useAuth()
  const userStore = auth?.store || ""
  const userRole = auth?.role || ""

  const [employees, setEmployees] = React.useState<AdminEmployeeItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [storeFilter, setStoreFilter] = React.useState("")
  const [month, setMonth] = React.useState(bangkokYearMonth)
  const [kindFlags, setKindFlags] = React.useState<Record<HrCalendarEventKind, boolean>>(defaultKindFlags)
  /** 빈 문자열 = 입사 년차 전체 */
  const [anniversaryYearFilter, setAnniversaryYearFilter] = React.useState("")

  const todayBangkok = React.useMemo(() => bangkokTodayYmd(), [month])

  React.useEffect(() => {
    setLoading(true)
    getAdminEmployeeList({ userStore, userRole })
      .then((r) => setEmployees(Array.isArray(r.list) ? r.list : []))
      .catch(() => setEmployees([]))
      .finally(() => setLoading(false))
  }, [userStore, userRole])

  const storeOptions = React.useMemo(() => uniqueStoresFromEmployees(employees), [employees])

  const [y, m] = month.split("-").map(Number)
  const allEvents = React.useMemo(
    () => buildHrCalendarEvents(employees, { viewYear: y, viewMonth: m, storeFilter }),
    [employees, y, m, storeFilter]
  )

  const filteredEvents = React.useMemo(() => {
    const yearN =
      anniversaryYearFilter === "" ? null : Number.parseInt(anniversaryYearFilter, 10)
    const yearOk = yearN != null && Number.isFinite(yearN) && yearN > 0

    return allEvents.filter((e) => {
      if (!kindFlags[e.kind]) return false
      if (e.kind === "anniversary" && yearOk) {
        if (e.anniversaryYears !== yearN) return false
      }
      return true
    })
  }, [allEvents, kindFlags, anniversaryYearFilter])

  const eventsByDate = React.useMemo(() => {
    const map: Record<string, HrCalendarEvent[]> = {}
    const monthPrefix = month
    for (const e of filteredEvents) {
      const d = e.date.slice(0, 10)
      if (d.startsWith(monthPrefix)) {
        if (!map[d]) map[d] = []
        map[d].push(e)
      }
    }
    return map
  }, [filteredEvents, month])

  const firstDay = new Date(y, m - 1, 1)
  const lastDay = new Date(y, m, 0)
  const startPad = firstDay.getDay()
  const daysInMonth = lastDay.getDate()

  const weeks: (number | null)[][] = []
  let w: (number | null)[] = []
  for (let i = 0; i < startPad; i++) w.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    w.push(d)
    if (w.length === 7) {
      weeks.push(w)
      w = []
    }
  }
  if (w.length) {
    while (w.length < 7) w.push(null)
    weeks.push(w)
  }

  const monthLabel = React.useMemo(() => {
    const loc = MONTH_LABEL_LOCALE[lang] || "ko-KR"
    try {
      return new Intl.DateTimeFormat(loc, { year: "numeric", month: "long" }).format(new Date(y, m - 1, 1))
    } catch {
      return `${y}-${String(m).padStart(2, "0")}`
    }
  }, [y, m, lang])

  const weekdayLabels = React.useMemo(() => {
    const loc = MONTH_LABEL_LOCALE[lang] || "ko-KR"
    const fmt = new Intl.DateTimeFormat(loc, { weekday: "short" })
    return Array.from({ length: 7 }, (_, dow) => fmt.format(new Date(2024, 0, 7 + dow)))
  }, [lang])

  return (
    <div className="flex-1 overflow-auto bg-gradient-to-b from-muted/40 via-background to-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Card className="overflow-hidden border-border/60 shadow-md">
          <CardHeader className="space-y-4 border-b border-border/50 bg-gradient-to-br from-primary/[0.06] via-card to-card pb-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/12 shadow-inner">
                  <CalendarDays className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl font-bold tracking-tight">{t("adminHrCalendar")}</CardTitle>
                  <CardDescription className="mt-1.5 max-w-xl text-pretty">{t("hrCalHint")}</CardDescription>
                </div>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                <select
                  value={storeFilter}
                  onChange={(e) => setStoreFilter(e.target.value)}
                  className="h-10 w-full max-w-[280px] rounded-lg border border-input bg-background px-3 text-sm shadow-sm sm:w-auto"
                  aria-label={t("emp_label_store")}
                >
                  <option value="">{t("hrCalAllStores")}</option>
                  {storeOptions.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
                <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/60 bg-background/90 px-3 py-2 shadow-sm">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("hrCalFilterByType")}
                    </span>
                    {HR_CAL_KIND_ORDER.map((kind) => (
                      <div key={kind} className="flex items-center gap-2">
                        <Checkbox
                          id={`hr-cal-kind-${kind}`}
                          checked={kindFlags[kind]}
                          onCheckedChange={(v) =>
                            setKindFlags((prev) => ({ ...prev, [kind]: v === true }))
                          }
                        />
                        <Label
                          htmlFor={`hr-cal-kind-${kind}`}
                          className={cn(
                            "cursor-pointer text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
                            kind === "birthday" && "text-rose-800 dark:text-rose-200",
                            kind === "hire" && "text-sky-800 dark:text-sky-200",
                            kind === "anniversary" && "text-violet-800 dark:text-violet-200",
                            kind === "resign" && "text-slate-700 dark:text-slate-300"
                          )}
                        >
                          {filterRowKindLabel(kind, t)}
                        </Label>
                      </div>
                    ))}
                    <div
                      className={cn(
                        "flex items-center gap-2 border-border/60 sm:border-l sm:pl-3",
                        !kindFlags.anniversary && "pointer-events-none opacity-50"
                      )}
                    >
                      <Label
                        htmlFor="hr-cal-anniv-year"
                        className="shrink-0 text-xs font-medium text-muted-foreground whitespace-nowrap"
                      >
                        {t("hrCalAnniversaryYearLabel")}
                      </Label>
                      <select
                        id="hr-cal-anniv-year"
                        value={anniversaryYearFilter}
                        onChange={(e) => setAnniversaryYearFilter(e.target.value)}
                        disabled={!kindFlags.anniversary}
                        className="h-9 max-w-[9.5rem] rounded-lg border border-input bg-background px-2 text-sm shadow-sm disabled:cursor-not-allowed"
                        aria-label={t("hrCalAnniversaryYearLabel")}
                      >
                        <option value="">{t("hrCalAnniversaryYearAll")}</option>
                        {Array.from({ length: ANNIVERSARY_YEAR_MAX }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={String(n)}>
                            {t("hrCalWorkYearNth").replace("{n}", String(n))}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs sm:ml-1"
                      onClick={() => {
                        setKindFlags(defaultKindFlags())
                        setAnniversaryYearFilter("")
                      }}
                    >
                      {t("hrCalFilterAllTypes")}
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => setMonth((prev) => shiftYearMonth(prev, -1))}
                      aria-label={t("hrCalPrevMonth")}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <input
                      type="month"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                      className="h-10 rounded-lg border border-input bg-background px-3 text-sm shadow-sm"
                      aria-label={monthLabel}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={() => setMonth((prev) => shiftYearMonth(prev, 1))}
                      aria-label={t("hrCalNextMonth")}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <span className="hidden text-sm font-medium text-foreground sm:inline">{monthLabel}</span>
                    <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium tabular-nums text-muted-foreground">
                      {filteredEvents.length}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border/40 pt-3">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                    eventKindSurface("birthday")
                  )}
                >
                  {t("hrCalTypeBirth")}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                    eventKindSurface("hire")
                  )}
                >
                  {t("hrCalTypeHire")}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                    eventKindSurface("anniversary")
                  )}
                >
                  {t("hrCalWorkYearLegend")}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium",
                    eventKindSurface("resign")
                  )}
                >
                  {t("hrCalTypeResign")}
                </span>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 sm:p-6">
            {loading && <div className="py-12 text-center text-sm text-muted-foreground">{t("loading")}</div>}
            {!loading && (
              <TooltipProvider delayDuration={200}>
                <div className="overflow-hidden rounded-2xl border border-border/70 bg-muted/20 p-1 shadow-inner">
                  <div className="grid grid-cols-7 gap-px rounded-xl bg-border/50 p-px">
                    {weekdayLabels.map((label, wi) => (
                      <div
                        key={label + wi}
                        className={cn(
                          "bg-muted/80 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground first:rounded-tl-lg last:rounded-tr-lg sm:text-xs",
                          wi === 0 && "text-rose-600/90 dark:text-rose-400/90",
                          wi === 6 && "text-sky-600/90 dark:text-sky-400/90"
                        )}
                      >
                        {label}
                      </div>
                    ))}
                    {weeks.flatMap((week, wi) =>
                      week.map((d, colIdx) => {
                        const isWeekend = colIdx === 0 || colIdx === 6
                        const key = `${wi}-${colIdx}`
                        if (d == null) {
                          return (
                            <div
                              key={key}
                              className={cn(
                                "min-h-[100px] bg-muted/15 sm:min-h-[112px]",
                                wi === weeks.length - 1 && colIdx === 0 && "rounded-bl-xl",
                                wi === weeks.length - 1 && colIdx === 6 && "rounded-br-xl"
                              )}
                            />
                          )
                        }
                        const ymd = `${month}-${String(d).padStart(2, "0")}`
                        const isToday = ymd === todayBangkok
                        const dayEvents = eventsByDate[ymd] || []
                        return (
                          <div
                            key={key}
                            className={cn(
                              "flex min-h-[100px] flex-col bg-background p-1.5 transition-colors sm:min-h-[112px] sm:p-2",
                              isWeekend && "bg-muted/20",
                              isToday &&
                                "bg-primary/[0.06] ring-1 ring-inset ring-primary/30 dark:bg-primary/[0.09]",
                              wi === weeks.length - 1 && colIdx === 0 && "rounded-bl-xl",
                              wi === weeks.length - 1 && colIdx === 6 && "rounded-br-xl"
                            )}
                          >
                            <div className="mb-1 flex items-center justify-between gap-1">
                              <span
                                className={cn(
                                  "inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg text-sm font-semibold tabular-nums",
                                  isToday
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-foreground/90"
                                )}
                              >
                                {d}
                              </span>
                              {isToday ? (
                                <span className="truncate text-[10px] font-medium text-primary">{t("hrCalToday")}</span>
                              ) : null}
                            </div>
                            <div className="flex min-h-0 flex-1 flex-col gap-1">
                              {dayEvents.map((ev) => {
                                const empHref = hrCalEmployeeHref(ev)
                                const chipCn = cn(
                                  "truncate rounded-md px-1.5 py-1 text-left text-[10px] font-medium leading-tight outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  eventKindSurface(ev.kind),
                                  empHref ? "cursor-pointer hover:opacity-90" : "cursor-default"
                                )
                                return (
                                <Tooltip key={ev.id}>
                                  <TooltipTrigger asChild>
                                    {empHref ? (
                                      <Link href={empHref} className={chipCn}>
                                        {formatHrCalLabel(ev, t)}
                                      </Link>
                                    ) : (
                                      <div className={chipCn} tabIndex={0}>
                                        {formatHrCalLabel(ev, t)}
                                      </div>
                                    )}
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="top"
                                    sideOffset={6}
                                    className="max-w-[min(92vw,22rem)] whitespace-pre-line break-words text-left leading-snug"
                                  >
                                    {formatHrCalTooltip(ev, t)}
                                  </TooltipContent>
                                </Tooltip>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </TooltipProvider>
            )}
          </CardContent>
        </Card>

        {!loading && (
          <Card className="mt-8 border-border/60 shadow-md">
            <CardHeader className="border-b border-border/50 pb-4">
              <CardTitle className="text-lg font-semibold">{t("hrCalMonthListTitle")}</CardTitle>
              <CardDescription>
                {monthLabel} · {filteredEvents.length}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 pt-0">
              {filteredEvents.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm text-muted-foreground">
                  {allEvents.length > 0 ? t("hrCalListEmptyFiltered") : t("hrCalListEmpty")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[1%] whitespace-nowrap pl-6">{t("hrCalListColDate")}</TableHead>
                      <TableHead className="w-[1%] whitespace-nowrap">{t("hrCalListColType")}</TableHead>
                      <TableHead>{t("hrCalListColStore")}</TableHead>
                      <TableHead>{t("hrCalListColNick")}</TableHead>
                      <TableHead className="pr-6">{t("hrCalListColNote")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEvents.map((ev) => {
                      const empHref = hrCalEmployeeHref(ev)
                      return (
                      <TableRow
                        key={ev.id}
                        className={empHref ? "cursor-pointer hover:bg-muted/40" : undefined}
                        onClick={() => {
                          if (empHref) router.push(empHref)
                        }}
                      >
                        <TableCell className="whitespace-nowrap pl-6 font-medium tabular-nums text-foreground">
                          {formatListDate(ev.date, lang)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex rounded-md px-2 py-0.5 text-xs font-medium",
                              eventKindSurface(ev.kind)
                            )}
                          >
                            {formatEventTypeLabel(ev, t)}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{ev.store}</TableCell>
                        <TableCell className="font-medium">{ev.nick}</TableCell>
                        <TableCell className="pr-6 text-muted-foreground">
                          {ev.legalName ? t("hrCalTooltipLegalName").replace("{name}", ev.legalName) : "—"}
                        </TableCell>
                      </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
