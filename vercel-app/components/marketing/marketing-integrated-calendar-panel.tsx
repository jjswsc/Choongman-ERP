"use client"

import * as React from "react"
import Link from "next/link"
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutGrid,
  Sparkles,
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
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  CALENDAR_LAYER_OPTIONS,
  layerOfEvent,
  type CalendarLayerId,
  type MarketingCalendarEvent,
} from "./marketing-calendar-utils"
import { MarketingPageHero } from "./marketing-page-hero"

function campaignListLabel(c: MarketingCampaign) {
  const no = (c.campaignNo ?? "").trim()
  return no ? `[${no}] ${c.topic}` : c.topic
}

const LAYER_CHIP: Record<CalendarLayerId, string> = {
  campaign: "bg-violet-500/15 text-violet-800 border-violet-200 dark:text-violet-200 dark:border-violet-800",
  promo: "bg-indigo-500/15 text-indigo-800 border-indigo-200 dark:text-indigo-200 dark:border-indigo-800",
  ad: "bg-emerald-500/15 text-emerald-800 border-emerald-200 dark:text-emerald-200 dark:border-emerald-800",
  influencer: "bg-amber-500/15 text-amber-900 border-amber-200 dark:text-amber-200 dark:border-amber-800",
  material: "bg-rose-500/15 text-rose-800 border-rose-200 dark:text-rose-200 dark:border-rose-800",
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
}

export function MarketingIntegratedCalendarPanel({
  campaignIdFromQuery = "",
  compactHeader = false,
}: MarketingIntegratedCalendarPanelProps) {
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
    () => new Set(["campaign", "promo", "ad", "influencer", "material"])
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
        promoId: promoFilter.trim(),
      }),
    [rawEvents, layers, campaignFilter, storeFilter, promoFilter]
  )

  const eventsByDate = React.useMemo(() => eventsByDateForMonth(filteredEvents, month), [filteredEvents, month])

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

  const { startPad, daysInMonth, y, m } = getBangkokMonthGridMeta(month)
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

  const monthLabel = `${y}년 ${m}월`

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
    const by = { campaign: 0, promo: 0, ad: 0, influencer: 0, material: 0 }
    for (const e of monthEvents) {
      const L = layerOfEvent(e)
      by[L]++
    }
    return { total: monthEvents.length, by }
  }, [filteredEvents, month])

  return (
    <div className="space-y-4">
      {compactHeader && (
        <p className="text-sm text-muted-foreground">
          캠페인·프로모션 세트·광고(ROAS)·인플루언서·홍보물 일정을 한눈에 보고, 매장·유형별로 좁혀 확인합니다. (시간 기준: 방콕)
        </p>
      )}
      {!compactHeader && (
        <MarketingPageHero
          icon={CalendarDays}
          title="통합 마케팅 캘린더"
          description="캠페인·프로모션 세트·광고(ROAS)·인플루언서·홍보물 일정을 한 화면에서 필터링합니다. 매장·캠페인별로 좁혀 실적과 집행을 맞춰 보세요."
          badge={
            <Badge variant="secondary" className="font-normal">
              방콕 기준
            </Badge>
          }
          actions={
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
              <Link href="/admin/marketing/report?tab=performance">
                <Sparkles className="h-3.5 w-3.5" />
                실적 대시보드
              </Link>
            </Button>
          }
        />
      )}

      <div className="rounded-2xl border bg-card/50 p-4 shadow-sm backdrop-blur-sm">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              표시 유형
            </div>
            <div className="flex flex-wrap gap-2">
              {CALENDAR_LAYER_OPTIONS.map((opt) => {
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
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:grid-cols-4 lg:max-w-4xl">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">캠페인</label>
              <Select value={campaignFilter || "__all__"} onValueChange={(v) => setCampaignFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 캠페인</SelectItem>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {campaignListLabel(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">매장</label>
              <Select value={storeFilter || "__all__"} onValueChange={(v) => setStoreFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue placeholder="전체 매장" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 매장</SelectItem>
                  {storeList.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">프로모션 세트</label>
              <Select value={promoFilter || "__all__"} onValueChange={(v) => setPromoFilter(v === "__all__" ? "" : v)}>
                <SelectTrigger className="h-9 bg-background">
                  <SelectValue placeholder="전체" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">전체 프로모션</SelectItem>
                  {promoOptions.map(([id, label]) => (
                    <SelectItem key={id} value={id}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">대상 월</label>
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
              {monthLabel} 일정 {summaryCounts.total}건
            </span>
            <Separator orientation="vertical" className="hidden h-4 sm:inline-flex" />
            <span>
              캠페인 {summaryCounts.by.campaign} · 프로모션 {summaryCounts.by.promo} · 광고 {summaryCounts.by.ad} · 인플{" "}
              {summaryCounts.by.influencer} · 홍보물 {summaryCounts.by.material}
            </span>
          </div>
          {storeFilter && (
            <span className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 text-[11px]">
              <Store className="h-3 w-3" />
              매장 필터: {storeFilter}
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
              이번 달
            </Button>
          </div>
          <p className="text-sm font-medium">{monthLabel}</p>
        </div>

        {loading && <div className="py-16 text-center text-sm text-muted-foreground">불러오는 중…</div>}
        {loadError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">일정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>
        )}
        {!loading && !loadError && (
          <div className="mt-3 overflow-hidden rounded-xl border bg-background shadow-inner">
            <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
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
                                  +{dayEvents.length - 3} 더보기
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
          <span className="font-medium text-foreground">범례</span>
          {CALENDAR_LAYER_OPTIONS.map((opt) => (
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
              {selectedDay ? selectedDay.replace(/-/g, ". ") : ""}
            </SheetTitle>
            <p className="text-left text-xs text-muted-foreground">선택한 날짜의 필터 적용 일정입니다.</p>
          </SheetHeader>
          <ScrollArea className="mt-4 flex-1 pr-3">
            {selectedDay && (
              <ul className="space-y-3 pb-6">
                {(eventsByDate[selectedDay] || []).map((ev) => (
                  <li key={ev.id} className="rounded-xl border bg-muted/20 p-3">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={cn("text-[10px]", LAYER_CHIP[layerOfEvent(ev)])}>
                        {CALENDAR_LAYER_OPTIONS.find((o) => o.id === layerOfEvent(ev))?.label}
                      </Badge>
                      {(ev.campaignNo || ev.campaignId) && (
                        <span className="font-mono text-[10px] text-muted-foreground">{ev.campaignNo || ev.campaignId}</span>
                      )}
                    </div>
                    <p className="text-sm font-medium leading-snug">{ev.label}</p>
                    {ev.meta && <p className="mt-1 text-xs text-muted-foreground">{ev.meta}</p>}
                    {ev.campaignId && (
                      <Link
                        href={`/admin/marketing/campaigns?openCampaign=${encodeURIComponent(ev.campaignId)}`}
                        className="mt-2 inline-block text-xs text-primary hover:underline"
                      >
                        캠페인 허브로 이동
                      </Link>
                    )}
                  </li>
                ))}
                {(eventsByDate[selectedDay] || []).length === 0 && (
                  <li className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">이 날짜에 표시할 일정이 없습니다.</li>
                )}
              </ul>
            )}
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  )
}
