"use client"

import * as React from "react"
import { CalendarDays } from "lucide-react"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { getMarketingCampaigns, getMarketingAds, getMarketingInfluencers } from "@/lib/api-client"
import { cn } from "@/lib/utils"

type CalendarEvent = { date: string; label: string; type: "campaign" | "ad" | "influencer"; id: string }

export default function MarketingCalendarPage() {
  const t = useT(useLang().lang)
  const [events, setEvents] = React.useState<CalendarEvent[]>([])
  const [loading, setLoading] = React.useState(true)
  const [month, setMonth] = React.useState(() => new Date().toISOString().slice(0, 7))

  React.useEffect(() => {
    setLoading(true)
    Promise.all([getMarketingCampaigns(), getMarketingAds(), getMarketingInfluencers()])
      .then(([campaigns, ads, infs]) => {
        const list: CalendarEvent[] = []
        for (const c of campaigns || []) {
          if (c.startDate) list.push({ date: c.startDate, label: `[캠페인] ${c.topic} 시작`, type: "campaign", id: c.id })
          if (c.endDate && c.endDate !== c.startDate) list.push({ date: c.endDate, label: `[캠페인] ${c.topic} 종료`, type: "campaign", id: c.id })
        }
        for (const a of ads || []) {
          if (a.publishDate) list.push({ date: a.publishDate, label: `[광고] ${a.contentTopic || a.platform}`, type: "ad", id: a.id })
        }
        for (const i of infs || []) {
          if (i.publishDate) list.push({ date: i.publishDate, label: `[인플루언서] ${i.name}`, type: "influencer", id: i.id })
        }
        setEvents(list)
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }, [])

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
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <CalendarDays className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">
            {t("adminMarketingDashboard") || "마케팅"} 통합 캘린더
          </h1>
        </div>
        <div className="mb-4 flex items-center gap-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-md border px-3 text-sm"
          />
        </div>
        {loading && <div className="text-sm text-muted-foreground">{t("loading")}</div>}
        {!loading && (
          <div className="rounded-xl border bg-card overflow-hidden">
            <div className="grid grid-cols-7 border-b bg-muted/30 text-center text-xs font-medium">
              {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                <div key={d} className="py-2">{d}</div>
              ))}
            </div>
            <div className="divide-y">
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 min-h-[80px]">
                  {week.map((d, i) => (
                    <div key={i} className="border-r last:border-r-0 p-1 text-sm">
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
