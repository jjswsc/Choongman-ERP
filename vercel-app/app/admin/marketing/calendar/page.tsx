"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { CalendarDays } from "lucide-react"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { getMarketingCampaigns, getMarketingAds, getMarketingInfluencers, type MarketingCampaign } from "@/lib/api-client"
import { cn } from "@/lib/utils"

type CalendarEvent = { date: string; label: string; type: "campaign" | "ad" | "influencer"; id: string }

function campaignListLabel(c: MarketingCampaign) {
  const no = (c.campaignNo ?? "").trim()
  return no ? `[${no}] ${c.topic}` : c.topic
}

export default function MarketingCalendarPage() {
  const searchParams = useSearchParams()
  const t = useT(useLang().lang)
  const campaignIdFromQuery = searchParams.get("campaignId")?.trim() || ""

  const [campaigns, setCampaigns] = React.useState<MarketingCampaign[]>([])
  const [campaignFilter, setCampaignFilter] = React.useState("")
  const [events, setEvents] = React.useState<CalendarEvent[]>([])
  const [loading, setLoading] = React.useState(true)
  const [month, setMonth] = React.useState(() => new Date().toISOString().slice(0, 7))

  React.useEffect(() => {
    if (campaignIdFromQuery) setCampaignFilter(campaignIdFromQuery)
  }, [campaignIdFromQuery])

  React.useEffect(() => {
    setLoading(true)
    const cid = campaignFilter.trim()
    Promise.all([
      getMarketingCampaigns(),
      cid ? getMarketingAds({ campaignId: cid }) : getMarketingAds(),
      cid ? getMarketingInfluencers({ campaignId: cid }) : getMarketingInfluencers(),
    ])
      .then(([allCampaigns, ads, infs]) => {
        setCampaigns(Array.isArray(allCampaigns) ? allCampaigns : [])
        const cmap = new Map<string, MarketingCampaign>()
        for (const c of allCampaigns || []) {
          cmap.set(c.id, c)
        }

        const list: CalendarEvent[] = []
        const campScope = cid ? (allCampaigns || []).filter((c) => c.id === cid) : allCampaigns || []

        for (const c of campScope) {
          const tag = (c.campaignNo ?? "").trim() ? `[${(c.campaignNo ?? "").trim()}] ` : ""
          if (c.startDate)
            list.push({
              date: c.startDate,
              label: `[캠페인] ${tag}${c.topic} 시작`,
              type: "campaign",
              id: `c-start-${c.id}`,
            })
          if (c.endDate && c.endDate !== c.startDate)
            list.push({
              date: c.endDate,
              label: `[캠페인] ${tag}${c.topic} 종료`,
              type: "campaign",
              id: `c-end-${c.id}`,
            })
        }
        for (const a of ads || []) {
          if (!a.publishDate) continue
          if (cid && a.campaignId !== cid) continue
          const camp = a.campaignId ? cmap.get(a.campaignId) : undefined
          const tag = camp?.campaignNo?.trim() ? `[${camp.campaignNo}] ` : ""
          list.push({
            date: a.publishDate,
            label: `[광고] ${tag}${a.contentTopic || a.platform}`,
            type: "ad",
            id: `ad-${a.id}`,
          })
        }
        for (const i of infs || []) {
          if (!i.publishDate) continue
          if (cid && i.campaignId !== cid) continue
          const camp = i.campaignId ? cmap.get(i.campaignId) : undefined
          const tag = camp?.campaignNo?.trim() ? `[${camp.campaignNo}] ` : ""
          list.push({
            date: i.publishDate,
            label: `[인플루언서] ${tag}${i.name}`,
            type: "influencer",
            id: `inf-${i.id}`,
          })
        }
        setEvents(list)
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [campaignFilter])

  const [y, m] = month.split("-").map(Number)
  const firstDay = new Date(y, m - 1, 1)
  const lastDay = new Date(y, m, 0)
  const startPad = firstDay.getDay()
  const daysInMonth = lastDay.getDate()
  const eventsByDate: Record<string, CalendarEvent[]> = {}
  for (const e of events) {
    const d = e.date.slice(0, 10)
    if (d.startsWith(month)) {
      if (!eventsByDate[d]) eventsByDate[d] = []
      eventsByDate[d].push(e)
    }
  }

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

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <CalendarDays className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">
              {t("adminMarketingDashboard") || "마케팅"} 통합 캘린더
            </h1>
          </div>
          <select
            value={campaignFilter}
            onChange={(e) => setCampaignFilter(e.target.value)}
            className="h-9 max-w-xs rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">전체 캠페인</option>
            {campaigns.map((c) => (
              <option key={c.id} value={c.id}>
                {campaignListLabel(c)}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          캠페인·광고·인플 일정에 <strong className="text-foreground">캠페인 고유번호</strong>를 붙여 표시합니다. 특정 캠페인만 보려면 오른쪽에서 선택하세요.
        </div>

        <div className="mb-4 flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-md border px-3 text-sm"
          />
          <span className="text-sm text-muted-foreground">{monthLabel}</span>
        </div>
        {loading && <div className="text-sm text-muted-foreground">{t("loading")}</div>}
        {!loading && (
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-7 border-b bg-muted/30 text-center text-xs font-medium">
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                <div key={d} className="py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="divide-y">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid min-h-[80px] grid-cols-7">
                  {week.map((d, i) => (
                    <div key={i} className="border-r p-1 text-sm last:border-r-0">
                      {d != null ? (
                        <>
                          <div className="text-muted-foreground">{d}</div>
                          {(eventsByDate[`${month}-${String(d).padStart(2, "0")}`] || []).map((ev) => (
                            <div
                              key={ev.id}
                              className={cn(
                                "mt-0.5 truncate rounded px-1 py-0.5 text-[10px]",
                                ev.type === "campaign" && "bg-blue-100 text-blue-800",
                                ev.type === "ad" && "bg-green-100 text-green-800",
                                ev.type === "influencer" && "bg-amber-100 text-amber-800"
                              )}
                              title={ev.label}
                            >
                              {ev.label}
                            </div>
                          ))}
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
