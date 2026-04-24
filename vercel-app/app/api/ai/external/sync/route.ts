import { NextRequest, NextResponse } from "next/server"
import { requireAiAccess } from "@/lib/ai/auth"
import { getBangkokDateTimeString, getBangkokTodayDateString, addBangkokCalendarDays } from "@/lib/bangkok-time"
import { supabaseSelectFilter, supabaseUpsert } from "@/lib/supabase-server"
import { buildAiDataPolicy } from "@/lib/ai/policy"

type StoreProfile = {
  store_name?: string
  lat?: number | null
  lon?: number | null
  enabled?: boolean | null
}

function weatherCodeText(code: number | null): string {
  if (code == null) return "Unknown"
  if (code === 0) return "맑음"
  if ([1, 2, 3].includes(code)) return "구름"
  if ([45, 48].includes(code)) return "안개"
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "비"
  if ([71, 73, 75, 85, 86].includes(code)) return "눈"
  if ([95, 96, 99].includes(code)) return "뇌우"
  return `기상코드(${code})`
}

async function fetchHolidaysByYear(year: number): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  try {
    const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/TH`)
    if (!res.ok) return m
    const json = (await res.json()) as { date?: string; localName?: string; name?: string }[]
    for (const r of json || []) {
      const d = String(r.date || "").slice(0, 10)
      if (!d) continue
      m.set(d, String(r.localName || r.name || "Holiday"))
    }
  } catch {
    // ignore external failure
  }
  return m
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const access = await requireAiAccess(req)
  if (!access.ok) return access.response
  const policy = buildAiDataPolicy({
    scoped: access.scoped,
    intent: "ops_recommend",
    requestedStore: access.scoped.store || "All",
  })
  if (!policy.canSyncExternalContext) {
    return NextResponse.json(
      { error: "Office role required", code: "AI_OFFICE_REQUIRED" },
      { status: 403, headers }
    )
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }
  const days = Math.max(1, Math.min(Number(body.days || 7), 14))
  const storeFilter = String(body.store || "").trim()
  const today = getBangkokTodayDateString()
  const end = addBangkokCalendarDays(today, days - 1)

  const filters: string[] = ["enabled=eq.true"]
  if (storeFilter) filters.push(`store_name=eq.${encodeURIComponent(storeFilter)}`)
  const stores = (await supabaseSelectFilter("external_store_profiles", filters.join("&"), {
    order: "store_name.asc",
    limit: 500,
    select: "store_name,lat,lon,enabled",
  })) as StoreProfile[] | null

  const list = (stores || []).filter((s) => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon)))
  if (!list.length) {
    return NextResponse.json({ ok: true, synced: 0, message: "No enabled store profiles with lat/lon." }, { headers })
  }

  const years = Array.from(new Set([Number(today.slice(0, 4)), Number(end.slice(0, 4))]))
  const holidayMaps = await Promise.all(years.map((y) => fetchHolidaysByYear(y)))
  const holidayByDate = new Map<string, string>()
  for (const hm of holidayMaps) {
    hm.forEach((v, k) => holidayByDate.set(k, v))
  }

  let syncedRows = 0
  for (const s of list) {
    const lat = Number(s.lat)
    const lon = Number(s.lon)
    const storeName = String(s.store_name || "").trim()
    const url = new URL("https://api.open-meteo.com/v1/forecast")
    url.searchParams.set("latitude", String(lat))
    url.searchParams.set("longitude", String(lon))
    url.searchParams.set("daily", "weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,windspeed_10m_max")
    url.searchParams.set("timezone", "Asia/Bangkok")
    url.searchParams.set("start_date", today)
    url.searchParams.set("end_date", end)

    try {
      const res = await fetch(url.toString())
      if (!res.ok) continue
      const json = (await res.json()) as {
        daily?: {
          time?: string[]
          weathercode?: number[]
          temperature_2m_max?: number[]
          temperature_2m_min?: number[]
          precipitation_sum?: number[]
          precipitation_probability_max?: number[]
          windspeed_10m_max?: number[]
        }
      }
      const daily = json.daily
      const times = daily?.time || []
      const rows: Record<string, unknown>[] = []
      for (let i = 0; i < times.length; i += 1) {
        const date = String(times[i] || "").slice(0, 10)
        if (!date) continue
        const weatherCode = daily?.weathercode?.[i]
        const holidayName = holidayByDate.get(date) || null
        rows.push({
          date_bkk: date,
          store_name: storeName,
          weather_code: weatherCode ?? null,
          weather_text: weatherCodeText(weatherCode ?? null),
          temp_min_c: daily?.temperature_2m_min?.[i] ?? null,
          temp_max_c: daily?.temperature_2m_max?.[i] ?? null,
          rain_mm: daily?.precipitation_sum?.[i] ?? null,
          rain_prob: daily?.precipitation_probability_max?.[i] ?? null,
          humidity_avg: null,
          wind_max_kmh: daily?.windspeed_10m_max?.[i] ?? null,
          is_holiday: Boolean(holidayName),
          holiday_name: holidayName,
          event_tags: [],
          source: "open-meteo+nager",
          fetched_at: getBangkokDateTimeString(),
        })
      }
      if (rows.length) {
        await supabaseUpsert("external_context_daily", rows, "date_bkk,store_name")
        syncedRows += rows.length
      }
    } catch {
      // ignore each store failure to keep batch robust
    }
  }

  return NextResponse.json({ ok: true, synced: syncedRows, range: { start: today, end } }, { headers })
}

