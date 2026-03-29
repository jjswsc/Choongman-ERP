"use client"

import * as React from "react"
import Link from "next/link"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutGrid,
  Store,
} from "lucide-react"
import {
  getMarketingCampaigns,
  getMarketingAds,
  getMarketingInfluencers,
  getMarketingMaterials,
  getPosPromos,
  type MarketingAd,
  type MarketingCampaign,
  type MarketingInfluencer,
  type MarketingMaterial,
  type PosPromo,
} from "@/lib/api-client"
import { useStoreList } from "@/lib/use-store-list"
import { getBangkokDateStr } from "@/lib/pos-business-day"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  buildMarketingCalendarEvents,
  filterMarketingCalendarEvents,
  eventsByDateForMonth,
  getBangkokMonthGridMeta,
  CALENDAR_LAYER_IDS,
  layerOfEvent,
  type CalendarLayerId,
  type MarketingCalendarEvent,
  type MarketingCalendarEventLocale,
} from "./marketing-calendar-utils"
import { MarketingPageHero } from "./marketing-page-hero"

function campaignListLabel(c: MarketingCampaign) {
  const no = (c.campaignNo ?? "").trim()
  return no ? `[${no}] ${c.topic}` : c.topic
}

function bcp47FromAdminLang(lang: string): string {
  if (lang === "mm") return "my-MM"
  if (lang === "la") return "lo"
  return lang
}

function formatMonthYearLabel(ym: string, lang: string): string {
  const [y, mo] = ym.split("-").map(Number)
  if (!y || !mo) return ym
  return new Intl.DateTimeFormat(bcp47FromAdminLang(lang), {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "long",
  }).format(new Date(Date.UTC(y, mo - 1, 1)))
}

function weekdayShortHeaders(lang: string): string[] {
  const loc = bcp47FromAdminLang(lang)
  return [0, 1, 2, 3, 4, 5, 6].map((dow) =>
    new Intl.DateTimeFormat(loc, { weekday: "short" }).format(new Date(Date.UTC(2024, 0, 7 + dow)))
  )
}

function formatSheetDayTitle(ymd: string, lang: string): string {
  const [y, m, d] = ymd.split("-").map(Number)
  if (!y || !m || !d) return ymd
  return new Intl.DateTimeFormat(bcp47FromAdminLang(lang), {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
  }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)))
}

function calendarEventLocaleFromT(t: (key: string) => string): MarketingCalendarEventLocale {
  return {
    bracketCampaign: t("marketingCalBracketCampaign"),
    bracketPromo: t("marketingCalBracketPromo"),
    bracketAdRoas: t("marketingCalBracketAdRoas"),
    bracketInfluencer: t("marketingCalBracketInfluencer"),
    bracketMaterial: t("marketingCalBracketMaterial"),
    bracketCollab: t("marketingCalBracketCollab"),
    verbStart: t("marketingCalVerbStart"),
    verbEnd: t("marketingCalVerbEnd"),
    verbPublish: t("marketingCalVerbPublish"),
    verbShoot: t("marketingCalVerbShoot"),
    verbDisplayStart: t("marketingCalVerbDisplayStart"),
    verbDisplayShort: t("marketingCalVerbDisplayShort"),
    verbExposureEnd: t("marketingCalVerbExposureEnd"),
    verbDesignStart: t("marketingCalVerbDesignStart"),
    verbDesignEnd: t("marketingCalVerbDesignEnd"),
    defaultPromo: t("marketingCalDefaultPromo"),
    defaultAd: t("marketingCalDefaultAd"),
    defaultInfluencer: t("marketingCalDefaultInfluencer"),
    defaultMaterial: t("marketingCalDefaultMaterial"),
    inactive: t("marketingCalInactive"),
    metaStatusTpl: t("marketingCalMetaStatus"),
    metaFollowersTpl: t("marketingCalMetaFollowers"),
    spend: t("marketingCalSpend"),
    budget: t("marketingCalBudget"),
    sepMid: t("marketingCalSepMid"),
  }
}

const LAYER_CHIP: Record<CalendarLayerId, string> = {
  campaign: "bg-violet-500/15 text-violet-800 border-violet-200 dark:text-violet-200 dark:border-violet-800",
  promo: "bg-indigo-500/15 text-indigo-800 border-indigo-200 dark:text-indigo-200 dark:border-indigo-800",
  ad: "bg-emerald-500/15 text-emerald-800 border-emerald-200 dark:text-emerald-200 dark:border-emerald-800",
  influencer: "bg-amber-500/15 text-amber-900 border-amber-200 dark:text-amber-200 dark:border-amber-800",
  material: "bg-rose-500/15 text-rose-800 border-rose-200 dark:text-rose-200 dark:border-rose-800",
  collab: "bg-sky-500/15 text-sky-900 border-sky-200 dark:text-sky-200 dark:border-sky-800",
}

function addMonthsYm(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  const ny = d.getUTCFullYear()
  const nm = d.getUTCMonth() + 1
  return `${ny}-${String(nm).padStart(2, "0")}`
}

/** API 한 건이 실패(JSON 파싱·네트워크 등)해도 나머지 일정은 표시 */
function pickArray<T>(r: PromiseSettledResult<unknown>): T[] {
  if (r.status !== "fulfilled") return []
  const v = r.value
  return Array.isArray(v) ? (v as T[]) : []
}

export type MarketingIntegratedCalendarPanelProps = {
  campaignIdFromQuery?: string
  /** 상단 히어로/제목 축소 (리포트 허브 탭 안에서 사용) */
  compactHeader?: boolean
  /** 통합 캘린더 페이지 등에서 허브 내비와 맞추기 위해 히어로 설명 문구 숨김 */
  hideHeroDescription?: boolean
}

export function MarketingIntegratedCalendarPanel({
  campaignIdFromQuery = "",
  compactHeader = false,
  hideHeroDescription = false,
}: MarketingIntegratedCalendarPanelProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const calLocale = React.useMemo(() => calendarEventLocaleFromT(t), [t])
  const sortLocale = bcp47FromAdminLang(lang)
  const weekDayLabels = React.useMemo(() => weekdayShortHeaders(lang), [lang])
  const layerOptions = React.useMemo(
    () =>
      CALENDAR_LAYER_IDS.map((id) => ({
        id,
        label: t(`marketingCalLayer_${id}`),
        description: t(`marketingCalLayer_${id}Desc`),
      })),
    [t]
  )

  const { stores: storeList } = useStoreList()
  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [rawEvents, setRawEvents] = React.useState<MarketingCalendarEvent[]>([])
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState(false)

  const [month, setMonth] = React.useState(() => getBangkokDateStr().slice(0, 7))
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [storeFilter, setStoreFilter] = React.useState("")
  const [promoFilter, setPromoFilter] = React.useState("")
  const [layers, setLayers] = React.useState<Set<CalendarLayerId>>(
    () => new Set(["campaign", "promo", "ad", "influencer", "material", "collab"])
  )

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (campaignIdFromQuery) setCampaignFilter(campaignIdFromQuery)
  }, [campaignIdFromQuery])

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError(false)
    const cid = campaignFilter.trim()
    const run = async () => {
      const settled = await Promise.allSettled([
        getMarketingCampaigns(),
        cid ? getMarketingAds({ campaignId: cid }) : getMarketingAds(),
        cid ? getMarketingInfluencers({ campaignId: cid }) : getMarketingInfluencers(),
        cid ? getMarketingMaterials({ campaignId: cid }) : getMarketingMaterials(),
        cid ? getPosPromos({ campaignId: cid }) : getPosPromos(),
      ])
      if (cancelled) return
      const failed = settled.filter((r) => r.status === "rejected").length
      const camps = pickArray<MarketingCampaign>(settled[0])
      const ads = pickArray<MarketingAd>(settled[1])
      const infs = pickArray<MarketingInfluencer>(settled[2])
      const mats = pickArray<MarketingMaterial>(settled[3])
      const promos = pickArray<PosPromo>(settled[4])
      setCampaigns(camps)
      try {
        const built = buildMarketingCalendarEvents({
          campaigns: camps,
          ads,
          influencers: infs,
          materials: mats,
          promos,
          locale: calLocale,
        })
        setRawEvents(built)
        setLoadError(failed === 5)
      } catch {
        setRawEvents([])
        setLoadError(true)
      }
    }
    run()
      .catch(() => {
        if (!cancelled) {
          setCampaigns([])
          setRawEvents([])
          setLoadError(true)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [campaignFilter])

  const filteredEvents = React.useMemo(
    () =>
      filterMarketingCalendarEvents(rawEvents, {
        layers,
        campaignId: campaignFilter.trim(),
        storeName: storeFilter.trim(),
        promoId: "",
      }),
    [rawEvents, layers, campaignFilter, storeFilter]
  )

  const eventsByDate = React.useMemo(
    () => eventsByDateForMonth(filteredEvents, month, sortLocale),
    [filteredEvents, month, sortLocale]
  )

  const promoOptions = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const e of rawEvents) {
      if (e.promoId && e.layer === "promo") {
        const label = e.shortLabel || e.label
        if (!map.has(e.promoId)) map.set(e.promoId, label)
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "ko"))
  }, [rawEvents])

  const { startPad, daysInMonth } = getBangkokMonthGridMeta(month)
  const todayBangkok = getBangkokDateStr()

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

  const monthLabel = formatMonthYearLabel(month, lang)

  const openDay = (ymd: string) => {
    setSelectedDay(ymd)
    setSheetOpen(true)
  }

  const toggleLayer = (id: CalendarLayerId) => {
    setLayers((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        if (next.size <= 1) return next
        next.delete(id)
      } else next.add(id)
      return next
    })
  }

  const summaryCounts = React.useMemo(() => {
    const monthEvents = filteredEvents.filter((e) => e.date.startsWith(month))
    const by = { campaign: 0, promo: 0, ad: 0, influencer: 0, material: 0, collab: 0 }
    for (const e of monthEvents) {
      const L = layerOfEvent(e)
      by[L]++
    }
    return { total: monthEvents.length, by }
  }, [filteredEvents, month])

  return (
    <div className="space-y-4">
      {compactHeader && (
        <p className="text-sm text-muted-foreground">{t("marketingCalCompactHint")}</p>
      )}
      {!compactHeader && (
        <MarketingPageHero
          icon={CalendarDays}
          title={t("marketingCalHeroTitle")}
          description={hideHeroDescription ? undefined : t("marketingCalHeroDescription")}
        />
      )}

      <div className="rounded-2xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              {t("marketingCalDisplayTypes")}
            </div>
            <div className="flex flex-wrap gap-2">
              {layerOptions.map((opt) => {
                const on = layers.has(opt.id)
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleLayer(opt.id)}
                    title={opt.description}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      on
                        ? "border-primary bg-primary/10 text-foreground shadow-sm"
                        : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:max-w-3xl">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{t("marketingPerformanceFilterCampaign")}</label>
              <Select value={campaignFilter || "__all__"} onValueChange={(v) => setCampaignFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue placeholder={t("all")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("marketingCalAllCampaigns")}</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {campaignListLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{t("marketingPerformanceStore")}</label>
              <Select value={storeFilter || "__all__"} onValueChange={(v) => setStoreFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue placeholder={t("marketingPerformanceAllStores")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">{t("marketingPerformanceAllStores")}</SelectItem>
                  {storeList.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{t("marketingCalLabelTargetMonth")}</label>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
              />
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/20 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
            <span className="inline-flex items-center gap-1 font-medium text-foreground">
              <LayoutGrid className="h-3.5 w-3.5" />
              {monthLabel} {t("marketingCalWordSchedule")} {summaryCounts.total}
              {t("marketingCountUnit")}
            </span>
            <Separator orientation="vertical" className="hidden h-4 sm:inline-flex" />
            <span>
              {t("marketingCalSummaryBreakdown")
                .replace("{c}", String(summaryCounts.by.campaign))
                .replace("{p}", String(summaryCounts.by.promo))
                .replace("{a}", String(summaryCounts.by.ad))
                .replace("{i}", String(summaryCounts.by.influencer))
                .replace("{m}", String(summaryCounts.by.material))
                .replace("{b}", String(summaryCounts.by.collab))}
            </span>
          </div>
          {storeFilter && (
            <span className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 text-[11px]">
              <Store className="h-3 w-3" />
              {t("marketingCalStoreFilterPrefix")} {storeFilter}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth((m0) => addMonthsYm(m0, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setMonth((m0) => addMonthsYm(m0, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="ml-1 text-xs" onClick={() => setMonth(getBangkokDateStr().slice(0, 7))}>
              {t("marketingCalThisMonth")}
            </Button>
          </div>
          <p className="text-sm font-medium">{monthLabel}</p>
        </div>

        {loading && <div className="py-16 text-center text-sm text-muted-foreground">{t("loading")}</div>}
        {loadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {t("marketingCalLoadError")}
          </div>
        )}
        {!loading && !loadError && (
          <div className="mt-3 overflow-hidden rounded-xl border bg-background shadow-inner">
            <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {weekDayLabels.map((d, i) => (
                <div key={d} className={cn("py-2.5", i === 0 && "text-rose-600/90", i === 6 && "text-blue-600/90")}>
                  {d}
                </div>
              ))}
            </div>
            <div className="divide-y">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 divide-x">
                  {week.map((dayNum, di) => {
                    const ymd =
                      dayNum != null ? `${month}-${String(dayNum).padStart(2, "0")}` : ""
                    const dayEvents = dayNum != null ? eventsByDate[ymd] || [] : []
                    const isToday = ymd === todayBangkok
                    const overflow = dayEvents.length > 3
                    const visible = overflow ? dayEvents.slice(0, 3) : dayEvents

                    return (
                      <div
                        key={di}
                        className={cn(
                          "min-h-[104px] bg-card p-1.5 transition-colors sm:min-h-[120px]",
                          di === 0 && "bg-rose-500/[0.03]",
                          di === 6 && "bg-blue-500/[0.03]",
                          isToday && "ring-1 ring-inset ring-primary/40"
                        )}
                      >
                        {dayNum != null ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openDay(ymd)}
                              className={cn(
                                "mb-1 flex w-full items-center justify-between rounded-md px-1 py-0.5 text-left hover:bg-muted/80",
                                isToday && "font-semibold text-primary"
                              )}
                            >
                              <span className={cn("text-[13px] tabular-nums", isToday && "text-primary")}>{dayNum}</span>
                              {dayEvents.length > 0 && (
                                <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">{dayEvents.length}</span>
                              )}
                            </button>
                            <div className="space-y-0.5">
                              {visible.map((ev) => (
                                <div
                                  key={ev.id}
                                  className={cn(
                                    "truncate rounded border px-1 py-0.5 text-[10px] leading-tight",
                                    LAYER_CHIP[layerOfEvent(ev)]
                                  )}
                                  title={ev.label}
                                >
                                  {ev.shortLabel}
                                </div>
                              ))}
                              {overflow && (
                                <button
                                  type="button"
                                  onClick={() => openDay(ymd)}
                                  className="w-full rounded bg-muted/80 px-1 py-0.5 text-[10px] font-medium text-primary hover:underline"
                                >
                                  {t("marketingCalMoreExtra").replace("{n}", String(dayEvents.length - 3))}
                                </button>
                              )}
                            </div>
                          </>
                        ) : (
                          <div className="min-h-[20px]" />
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{t("marketingCalLegend")}</span>
          {layerOptions.map((opt) => (
            <span key={opt.id} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 rounded-sm border", LAYER_CHIP[opt.id])} />
              {opt.label}
            </span>
          ))}
        </div>
      </div>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-left">
              {selectedDay ? formatSheetDayTitle(selectedDay, lang) : ""}
            </SheetTitle>
            <p className="text-left text-xs text-muted-foreground">{t("marketingCalSheetDayHint")}</p>
          </SheetHeader>
          <ScrollArea className="mt-4 flex-1 pr-3">
            {selectedDay && (
              <ul className="space-y-3 pb-6">
                {(eventsByDate[selectedDay] || []).map((ev) => (
                  <li key={ev.id} className="rounded-xl border bg-muted/20 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={cn("text-[10px]", LAYER_CHIP[layerOfEvent(ev)])}>
                        {layerOptions.find((o) => o.id === layerOfEvent(ev))?.label}
                      </Badge>
                      {(ev.campaignNo || ev.campaignId) && (
                        <span className="font-mono text-[10px] text-muted-foreground">{ev.campaignNo || ev.campaignId}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium leading-snug">{ev.label}</p>
                    {ev.meta && <p className="mt-1 text-xs text-muted-foreground">{ev.meta}</p>}
                    {ev.campaignId && layerOfEvent(ev) === "collab" && (
                      <Link
                        href={`/admin/marketing/collab-menus?campaignId=${encodeURIComponent(ev.campaignId)}`}
                        className="mt-2 inline-block text-xs text-primary hover:underline"
                      >
                        {t("marketingCalGoCollabHub")}
                      </Link>
                    )}
                    {ev.campaignId && layerOfEvent(ev) !== "collab" && (
                      <Link
                        href={`/admin/marketing/campaigns?openCampaign=${encodeURIComponent(ev.campaignId)}`}
                        className="mt-2 inline-block text-xs text-primary hover:underline"
                      >
                        {t("marketingCalGoCampaignHub")}
                      </Link>
                    )}
                  </li>
                ))}
                {(eventsByDate[selectedDay] || []).length === 0 && (
                  <li className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    {t("marketingCalEmptyDay")}
                  </li>
                )}
              </ul>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  )
}
