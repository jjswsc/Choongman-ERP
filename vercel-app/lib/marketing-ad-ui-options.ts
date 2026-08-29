/**
 * 광고 ROAS 화면 — 플랫폼 / Content Format / Content Pillar 선택지.
 * 브라우저 localStorage에만 저장 (DB와 무관).
 */

const STORAGE_KEY = 'cm_marketing_ad_ui_options_v1'

export type MarketingAdPlatformOption = { value: string; label: string }
export type MarketingAdLabelOption = { value: string; label: string }

export const DEFAULT_MARKETING_AD_PLATFORMS: MarketingAdPlatformOption[] = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'line_oa', label: 'Line OA' },
  { value: 'twitter', label: 'Twitter' },
]

export const DEFAULT_MARKETING_AD_FORMATS: MarketingAdLabelOption[] = [
  { value: 'Album', label: 'Album' },
  { value: 'Single Banner', label: 'Single Banner' },
  { value: 'Video', label: 'Video' },
  { value: 'Reels', label: 'Reels' },
]

export const DEFAULT_MARKETING_AD_PILLARS: MarketingAdLabelOption[] = [
  { value: 'Product', label: 'Product' },
  { value: 'Promotion', label: 'Promotion' },
  { value: 'Branding', label: 'Branding' },
]

export type MarketingAdUiOptions = {
  platforms: MarketingAdPlatformOption[]
  formats: MarketingAdLabelOption[]
  pillars: MarketingAdLabelOption[]
}

export function defaultMarketingAdUiOptions(): MarketingAdUiOptions {
  return {
    platforms: DEFAULT_MARKETING_AD_PLATFORMS.map((p) => ({ ...p })),
    formats: DEFAULT_MARKETING_AD_FORMATS.map((p) => ({ ...p })),
    pillars: DEFAULT_MARKETING_AD_PILLARS.map((p) => ({ ...p })),
  }
}

function slugFromLabel(label: string): string {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
  return s || 'platform'
}

/** 플랫폼 추가 시 표시명으로부터 저장용 value 생성 */
export function newPlatformValue(label: string, existingValues: string[]): string {
  const taken = new Set(existingValues.map((x) => x.trim().toLowerCase()))
  const base = slugFromLabel(label)
  let v = base
  let n = 2
  while (taken.has(v)) {
    v = `${base}_${n}`
    n++
  }
  return v
}

function parseStored(raw: string | null): MarketingAdUiOptions | null {
  if (!raw?.trim()) return null
  try {
    const j = JSON.parse(raw) as unknown
    if (!j || typeof j !== 'object') return null
    const o = j as Record<string, unknown>
    const platforms = Array.isArray(o.platforms) ? o.platforms : []
    const formats = Array.isArray(o.formats) ? o.formats : []
    const pillars = Array.isArray(o.pillars) ? o.pillars : []
    const normPlat: MarketingAdPlatformOption[] = platforms
      .map((x) => {
        if (x && typeof x === 'object' && 'value' in x && 'label' in x) {
          const value = String((x as { value: unknown }).value ?? '').trim()
          const label = String((x as { label: unknown }).label ?? '').trim()
          if (!value || !label) return null
          return { value, label }
        }
        return null
      })
      .filter(Boolean) as MarketingAdPlatformOption[]
    const normSimple = (arr: unknown[]): MarketingAdLabelOption[] =>
      arr
        .map((x) => {
          if (x && typeof x === 'object' && 'value' in x && 'label' in x) {
            const value = String((x as { value: unknown }).value ?? '').trim()
            const label = String((x as { label: unknown }).label ?? '').trim()
            if (!value || !label) return null
            return { value, label }
          }
          if (typeof x === 'string' && x.trim()) {
            const v = x.trim()
            return { value: v, label: v }
          }
          return null
        })
        .filter(Boolean) as MarketingAdLabelOption[]
    const f = normSimple(formats)
    const p = normSimple(pillars)
    if (normPlat.length === 0 && f.length === 0 && p.length === 0) return null
    return {
      platforms: normPlat.length ? normPlat : defaultMarketingAdUiOptions().platforms,
      formats: f.length ? f : defaultMarketingAdUiOptions().formats,
      pillars: p.length ? p : defaultMarketingAdUiOptions().pillars,
    }
  } catch {
    return null
  }
}

export function loadMarketingAdUiOptions(): MarketingAdUiOptions {
  if (typeof window === 'undefined') return defaultMarketingAdUiOptions()
  const parsed = parseStored(window.localStorage.getItem(STORAGE_KEY))
  return parsed ?? defaultMarketingAdUiOptions()
}

export function saveMarketingAdUiOptions(opts: MarketingAdUiOptions): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(opts))
  } catch {
    /* ignore quota */
  }
}
