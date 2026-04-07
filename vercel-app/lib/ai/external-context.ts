import { supabaseSelectFilter } from "@/lib/supabase-server"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { isOfficeRole } from "@/lib/permissions"
import type { AiScopedAuth } from "@/lib/ai/types"

export interface ExternalSignal {
  date: string
  store: string
  weatherText: string
  rainProb: number | null
  tempMinC: number | null
  tempMaxC: number | null
  isHoliday: boolean
  holidayName: string | null
  eventTags: string[]
}

function summarizeSignals(rows: ExternalSignal[]): string {
  if (!rows.length) return "외부 환경 데이터 없음"
  const rainyDays = rows.filter((r) => (r.rainProb || 0) >= 60).length
  const holidayDays = rows.filter((r) => r.isHoliday).length
  const hotDays = rows.filter((r) => (r.tempMaxC || 0) >= 33).length
  return `총 ${rows.length}일 중 비위험 ${rainyDays}일, 휴일 ${holidayDays}일, 고온 ${hotDays}일`
}

export async function getExternalContextSummary(params: {
  scoped: AiScopedAuth
  store?: string
  start?: string
  end?: string
  limit?: number
}) {
  const scoped = params.scoped
  const targetStore = (params.store || scoped.store || "All").trim()
  const today = getBangkokTodayDateString()
  const start = (params.start || today).slice(0, 10)
  const end = (params.end || today).slice(0, 10)
  const limit = Math.max(1, Math.min(params.limit ?? 21, 60))

  const filters: string[] = [
    `date_bkk=gte.${encodeURIComponent(start)}`,
    `date_bkk=lte.${encodeURIComponent(end)}`,
  ]
  if (targetStore !== "All" && targetStore) {
    filters.push(`store_name=eq.${encodeURIComponent(targetStore)}`)
  } else if (!isOfficeRole(scoped.role)) {
    filters.push(`store_name=eq.${encodeURIComponent(scoped.store || "All")}`)
  }

  const rows = (await supabaseSelectFilter("external_context_daily", filters.join("&"), {
    order: "date_bkk.asc",
    limit,
    select:
      "date_bkk,store_name,weather_text,rain_prob,temp_min_c,temp_max_c,is_holiday,holiday_name,event_tags",
  }).catch(() => [])) as
    | {
        date_bkk?: string
        store_name?: string
        weather_text?: string | null
        rain_prob?: number | null
        temp_min_c?: number | null
        temp_max_c?: number | null
        is_holiday?: boolean | null
        holiday_name?: string | null
        event_tags?: string[] | null
      }[]
    | null

  const signals: ExternalSignal[] = (rows || []).map((r) => ({
    date: String(r.date_bkk || ""),
    store: String(r.store_name || ""),
    weatherText: String(r.weather_text || "N/A"),
    rainProb: r.rain_prob == null ? null : Number(r.rain_prob),
    tempMinC: r.temp_min_c == null ? null : Number(r.temp_min_c),
    tempMaxC: r.temp_max_c == null ? null : Number(r.temp_max_c),
    isHoliday: Boolean(r.is_holiday),
    holidayName: r.holiday_name == null ? null : String(r.holiday_name),
    eventTags: Array.isArray(r.event_tags) ? r.event_tags.map((x) => String(x)) : [],
  }))

  if (signals.length === 0) {
    try {
      // 매장 좌표/동기화 전에도 최소한의 외부 컨텍스트를 제공하기 위한 방콕 기본값
      const fallbackUrl = new URL("https://api.open-meteo.com/v1/forecast")
      fallbackUrl.searchParams.set("latitude", "13.7563")
      fallbackUrl.searchParams.set("longitude", "100.5018")
      fallbackUrl.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max")
      fallbackUrl.searchParams.set("timezone", "Asia/Bangkok")
      fallbackUrl.searchParams.set("start_date", start)
      fallbackUrl.searchParams.set("end_date", end)
      const res = await fetch(fallbackUrl.toString())
      if (res.ok) {
        const json = (await res.json()) as {
          daily?: {
            time?: string[]
            weathercode?: number[]
            temperature_2m_min?: number[]
            temperature_2m_max?: number[]
            precipitation_probability_max?: number[]
          }
        }
        const t = json.daily?.time || []
        const out: ExternalSignal[] = []
        for (let i = 0; i < t.length; i += 1) {
          const weatherCode = Number(json.daily?.weathercode?.[i] ?? -1)
          const weatherText =
            weatherCode === 0 ? "맑음" :
            [1, 2, 3].includes(weatherCode) ? "구름" :
            [51, 53, 55, 61, 63, 65, 80, 81, 82].includes(weatherCode) ? "비" :
            [95, 96, 99].includes(weatherCode) ? "뇌우" :
            "기상"
          out.push({
            date: String(t[i] || "").slice(0, 10),
            store: targetStore === "All" ? "Bangkok(Default)" : targetStore,
            weatherText,
            rainProb: json.daily?.precipitation_probability_max?.[i] == null ? null : Number(json.daily?.precipitation_probability_max?.[i]),
            tempMinC: json.daily?.temperature_2m_min?.[i] == null ? null : Number(json.daily?.temperature_2m_min?.[i]),
            tempMaxC: json.daily?.temperature_2m_max?.[i] == null ? null : Number(json.daily?.temperature_2m_max?.[i]),
            isHoliday: false,
            holidayName: null,
            eventTags: ["fallback-weather"],
          })
        }
        if (out.length > 0) {
          return {
            summaryText: `${summarizeSignals(out)} (매장 좌표 미설정으로 방콕 기본값 사용)`,
            signals: out,
          }
        }
      }
    } catch {
      // ignore fallback fetch errors
    }
  }

  return {
    summaryText: summarizeSignals(signals),
    signals,
  }
}

