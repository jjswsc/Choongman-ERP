import type { MetaAdInsightRow } from "./meta-graph"

export function normalizeMetaName(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣ก-๙]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Meta Boost/유기 포스트 캠페인명 (โพสต์: / โพสต์บน Instagram: / Post: 등) */
const META_ORGANIC_POST_PREFIX =
  /^(โพสต์(?:บน\s*(?:instagram|facebook))?|post(?:\s+on\s+(?:instagram|facebook))?)\s*:/i

export function isMetaOrganicPostCampaignName(name: string): boolean {
  return META_ORGANIC_POST_PREFIX.test(String(name || "").trim())
}

/** 플랫폼 접두어를 뺀 본문 — FB·IG 같은 내용 부스트를 한쪽으로 묶을 때 사용 */
export function metaOrganicPostCoreName(name: string): string {
  const s = String(name || "").trim()
  if (!isMetaOrganicPostCampaignName(s)) return ""
  return normalizeMetaName(s.replace(META_ORGANIC_POST_PREFIX, ""))
}

/** 「การโปรโมท … ในวันที่ [D/M/YYYY]」 또는 [M/D/YYYY] 에서 날짜 추출 (최신순 정렬용) */
export function parseMetaPromoDateMs(name: string): number | null {
  const m = String(name || "").match(/\[(\d{1,2})\/(\d{1,2})\/(\d{4})\]/)
  if (!m) return null
  let day = Number(m[1])
  let month = Number(m[2])
  const year = Number(m[3])
  if (month > 12 && day >= 1 && day <= 12) {
    const swap = day
    day = month
    month = swap
  }
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  const t = Date.UTC(year, month - 1, day)
  return Number.isFinite(t) ? t : null
}

function pushYear(years: Set<number>, year: number | null | undefined) {
  if (year != null && year >= 2000 && year <= 2100) years.add(year)
}

/** Meta created_time / updated_time — ISO·unix·일반 날짜 문자열 */
export function yearFromMetaTimestamp(raw: string | number | undefined | null): number | null {
  if (raw == null || raw === "") return null
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const ms = raw > 1e12 ? raw : raw * 1000
    const y = new Date(ms).getUTCFullYear()
    return y >= 2000 && y <= 2100 ? y : null
  }
  const s = String(raw).trim()
  if (!s) return null
  const iso = s.match(/^(20\d{2})(?:[-T\s]|$)/)
  if (iso) return Number(iso[1])
  if (/^\d{9,13}$/.test(s)) {
    const n = Number(s)
    const ms = n > 1e12 ? n : n * 1000
    const y = new Date(ms).getUTCFullYear()
    return y >= 2000 && y <= 2100 ? y : null
  }
  const t = Date.parse(s)
  if (Number.isFinite(t)) {
    const y = new Date(t).getUTCFullYear()
    return y >= 2000 && y <= 2100 ? y : null
  }
  return null
}

/**
 * 목록 필터에 쓸 연도. 제목 날짜와 생성 시각을 같이 둔다.
 * 게시물 홍보(โพสต์/Post) 본문에 적힌 연도는 쓰지 않는다.
 */
export function metaCampaignYears(name: string, createdTime?: string, extra?: number[]): number[] {
  const years = new Set<number>()
  const ms = parseMetaPromoDateMs(name)
  if (ms != null) pushYear(years, new Date(ms).getUTCFullYear())
  pushYear(years, yearFromMetaTimestamp(createdTime))
  if (!isMetaOrganicPostCampaignName(name)) {
    const inName = String(name || "").match(/(?:^|[^\d])(20\d{2})(?:[^\d]|$)/)
    if (inName) pushYear(years, Number(inName[1]))
  }
  for (const y of extra || []) pushYear(years, y)
  return [...years].sort((a, b) => b - a)
}

/** 표시용. 해당하는 연도 중 가장 최근. */
export function metaCampaignYear(name: string, createdTime?: string, extra?: number[]): number | null {
  return metaCampaignYears(name, createdTime, extra)[0] ?? null
}

function metaCampaignSortKey(id: string, name: string): number {
  const fromDate = parseMetaPromoDateMs(name)
  if (fromDate != null) return fromDate
  // Meta 객체 ID는 대체로 증가 → 숫자로 비교
  const n = Number(String(id || "").replace(/\D/g, "").slice(0, 15))
  return Number.isFinite(n) ? n : 0
}

/** ERP 캠페인에 연결한 Meta Ads 캠페인(또는 게시물 홍보) 1건 */
export type MetaCampaignLink = { id: string; name: string }

/**
 * DB TEXT(meta_campaign_id / name) ↔ 다중 링크.
 * 1건: 기존처럼 평문 id·name. 2건 이상: id 컬럼에 JSON 배열, name은 " | " 조인(표시용).
 */
export function parseMetaCampaignLinks(idRaw?: string | null, nameRaw?: string | null): MetaCampaignLink[] {
  const id = String(idRaw || "").trim()
  const name = String(nameRaw || "").trim()
  if (id.startsWith("[")) {
    try {
      const arr = JSON.parse(id) as unknown
      if (Array.isArray(arr)) {
        const out: MetaCampaignLink[] = []
        for (const x of arr) {
          if (!x || typeof x !== "object") continue
          const o = x as Record<string, unknown>
          const lid = String(o.id ?? "").trim()
          const lname = String(o.name ?? "").trim()
          if (!lid && !lname) continue
          out.push({ id: lid, name: lname || lid })
        }
        if (out.length) return out
      }
    } catch {
      /* legacy plain text */
    }
  }
  if (!id && !name) return []
  return [{ id, name: name || id }]
}

export function serializeMetaCampaignLinks(links: MetaCampaignLink[]): { id: string; name: string } {
  const clean = links
    .map((l) => ({ id: String(l.id || "").trim(), name: String(l.name || "").trim() }))
    .filter((l) => l.id || l.name)
  if (!clean.length) return { id: "", name: "" }
  if (clean.length === 1) return { id: clean[0].id, name: clean[0].name || clean[0].id }
  return {
    id: JSON.stringify(clean),
    name: clean.map((l) => l.name || l.id).join(" | "),
  }
}

function adMatchesMetaLink(a: MetaAdInsightRow, link: MetaCampaignLink): boolean {
  const id = String(link.id || "").trim().toLowerCase()
  const mappedName = normalizeMetaName(link.name || "")
  if (id) {
    if (
      String(a.campaignId || "").toLowerCase() === id ||
      String(a.adId || "").toLowerCase() === id ||
      normalizeMetaName(a.campaignName) === id
    ) {
      return true
    }
  }
  const n = normalizeMetaName(a.campaignName)
  if (mappedName) {
    if (n === mappedName || n.includes(mappedName) || mappedName.includes(n)) return true
  }
  // FB โพสต์: / IG โพสต์บน Instagram: 같은 본문이면 한 ERP 연결로 둘 다 합산
  const linkCore = metaOrganicPostCoreName(link.name) || metaOrganicPostCoreName(link.id)
  const adCore = metaOrganicPostCoreName(a.campaignName)
  if (linkCore && adCore && linkCore.length >= 8 && adCore.length >= 8) {
    if (linkCore === adCore || linkCore.includes(adCore) || adCore.includes(linkCore)) return true
  }
  return false
}

/** ERP 캠페인과 Meta Ads campaign_name / id 매칭. 매핑·이름 겹침이 없으면 빈 배열. 다중 링크는 OR. */
export function filterAdsForCampaign(
  ads: MetaAdInsightRow[],
  campaign: { topic?: string; metaCampaignId?: string; metaCampaignName?: string }
): MetaAdInsightRow[] {
  const links = parseMetaCampaignLinks(campaign.metaCampaignId, campaign.metaCampaignName)
  if (links.length) {
    const out: MetaAdInsightRow[] = []
    const seen = new Set<string>()
    for (const a of ads) {
      const key = `${a.campaignId || ""}|${a.adId || ""}|${a.campaignName || ""}`
      if (seen.has(key)) continue
      if (!links.some((link) => adMatchesMetaLink(a, link))) continue
      seen.add(key)
      out.push(a)
    }
    return out
  }
  const topic = normalizeMetaName(campaign.topic || "")
  if (!topic) return []
  return ads.filter((a) => {
    const n = normalizeMetaName(a.campaignName)
    if (!n) return false
    return n.includes(topic) || topic.includes(n)
  })
}

export function materialStatusForColumn(col: "todo" | "doing" | "done"): string {
  if (col === "done") return "distributed"
  if (col === "doing") return "producing"
  return "planning"
}

export function influencerStatusForColumn(col: "todo" | "doing" | "done"): string {
  if (col === "done") return "finish"
  if (col === "doing") return "ongoing"
  return "draft"
}

export type MetaAdsCampaignOption = {
  id: string
  name: string
  /** 표시용. years 중 가장 최근. */
  year: number | null
  /** 제목·생성·집행 연도. 필터는 이 목록으로 맞춘다. */
  years: number[]
  organicPost: boolean
}

/**
 * Ads Manager 캠페인 목록 (매핑용).
 * 기본: โพสต์/Post 유기형 이름 제외, 날짜·ID 기준 최신순.
 */
export function uniqueMetaAdsCampaigns(
  ads: MetaAdInsightRow[],
  opts?: { includeOrganicPosts?: boolean }
): MetaAdsCampaignOption[] {
  const includePosts = opts?.includeOrganicPosts === true
  const map = new Map<string, { name: string; spend: number; createdTime?: string; delivered: number[] }>()
  for (const a of ads || []) {
    const id = String(a.campaignId || "").trim()
    const name = String(a.campaignName || "").trim()
    const key = id || name
    if (!key) continue
    if (!includePosts && isMetaOrganicPostCampaignName(name)) continue
    const spend = Number(a.spend) || 0
    const createdTime = String(a.createdTime || "").trim()
    const delivered = (a.deliveredYears || []).filter((y) => y >= 2000 && y <= 2100)
    const prev = map.get(key)
    if (!prev || spend > prev.spend || (!prev.name && name)) {
      const prevDelivered = prev?.delivered || []
      map.set(key, {
        name: name || id,
        spend: Math.max(prev?.spend || 0, spend),
        createdTime: createdTime || prev?.createdTime,
        delivered: [...new Set([...prevDelivered, ...delivered])],
      })
    } else {
      if (createdTime && !prev.createdTime) prev.createdTime = createdTime
      prev.delivered = [...new Set([...prev.delivered, ...delivered])]
    }
  }
  return [...map.entries()]
    .map(([id, v]) => {
      const years = metaCampaignYears(v.name, v.createdTime, v.delivered)
      return {
        id,
        name: v.name,
        year: years[0] ?? null,
        years,
        organicPost: isMetaOrganicPostCampaignName(v.name),
      }
    })
    .sort((a, b) => metaCampaignSortKey(b.id, b.name) - metaCampaignSortKey(a.id, a.name))
}

/**
 * 초기 필터는 항상 전체.
 * 연도 버튼은 Meta 캠페인 연도(제목·생성·집행)이지 ERP 캠페인 기간이 아니다.
 * 2026 ERP 캠페인에 예년 제목 Ads를 연결하는 경우가 많아 올해로 자동 좁히면 누락처럼 보인다.
 */
export function metaCampaignPickerInitialView(
  _options: MetaAdsCampaignOption[],
  _bangkokYear: number
): { year: number | "all"; includeOrganicPosts: boolean } {
  return { year: "all", includeOrganicPosts: false }
}

/** 연도 칩에 붙일 건수 (게시물 제외 / 포함) */
export function countMetaCampaignsByYear(
  options: MetaAdsCampaignOption[],
  includeOrganicPosts = false
): Map<number | "none", number> {
  const map = new Map<number | "none", number>()
  for (const o of options || []) {
    if (!includeOrganicPosts && o.organicPost) continue
    const years = o.years?.length ? o.years : o.year != null ? [o.year] : []
    if (!years.length) {
      map.set("none", (map.get("none") || 0) + 1)
      continue
    }
    for (const y of years) map.set(y, (map.get(y) || 0) + 1)
  }
  return map
}

/** 이름·ID·연도로 캠페인 목록을 좁힌다. */
export function filterMetaCampaignOptions(
  options: MetaAdsCampaignOption[],
  opts?: { query?: string; year?: number | "all" | "none"; includeOrganicPosts?: boolean }
): MetaAdsCampaignOption[] {
  const qRaw = String(opts?.query || "").trim().toLowerCase()
  const q = normalizeMetaName(opts?.query || "")
  const year = opts?.year ?? "all"
  const includePosts = opts?.includeOrganicPosts === true
  return (options || []).filter((o) => {
    const years = o.years?.length ? o.years : o.year != null ? [o.year] : []
    if (!includePosts && o.organicPost) return false
    if (year === "none" && years.length) return false
    if (typeof year === "number" && !years.includes(year)) return false
    if (!qRaw) return true
    if (q && normalizeMetaName(o.name).includes(q)) return true
    if (o.id.toLowerCase().includes(qRaw)) return true
    if (years.some((y) => String(y) === qRaw)) return true
    return false
  })
}
