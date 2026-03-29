/**
 * 홍보물 종류(type) 선택지 — 브라우저 localStorage (광고 ROAS UI 옵션과 동일 패턴).
 */

const STORAGE_KEY = "cm_marketing_material_types_v1"

export type MarketingMaterialTypeOption = { value: string; label: string }

export const DEFAULT_MARKETING_MATERIAL_TYPES: MarketingMaterialTypeOption[] = [
  { value: "tentcard", label: "텐트카드" },
  { value: "standee", label: "스탠디" },
  { value: "coupon", label: "쿠폰/전단" },
  { value: "flyer", label: "플라이어" },
  { value: "banner", label: "배너" },
  { value: "prop", label: "프롭" },
  { value: "other", label: "기타" },
]

export function defaultMarketingMaterialTypeOptions(): MarketingMaterialTypeOption[] {
  return DEFAULT_MARKETING_MATERIAL_TYPES.map((x) => ({ ...x }))
}

function slugFromLabel(label: string): string {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
  return s || "type"
}

export function newMaterialTypeValue(label: string, existingValues: string[]): string {
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

function parseStored(raw: string | null): MarketingMaterialTypeOption[] | null {
  if (!raw?.trim()) return null
  try {
    const j = JSON.parse(raw) as unknown
    if (!Array.isArray(j)) return null
    const out: MarketingMaterialTypeOption[] = j
      .map((x) => {
        if (x && typeof x === "object" && "value" in x && "label" in x) {
          const value = String((x as { value: unknown }).value ?? "").trim()
          const label = String((x as { label: unknown }).label ?? "").trim()
          if (!value || !label) return null
          return { value, label }
        }
        return null
      })
      .filter(Boolean) as MarketingMaterialTypeOption[]
    return out.length ? out : null
  } catch {
    return null
  }
}

export function loadMarketingMaterialTypeOptions(): MarketingMaterialTypeOption[] {
  if (typeof window === "undefined") return defaultMarketingMaterialTypeOptions()
  const parsed = parseStored(window.localStorage.getItem(STORAGE_KEY))
  return parsed ?? defaultMarketingMaterialTypeOptions()
}

export function saveMarketingMaterialTypeOptions(types: MarketingMaterialTypeOption[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(types))
  } catch {
    /* ignore quota */
  }
}

export function builtInMaterialTypeLabel(
  value: string,
  tr: (ko: string, en: string, th: string) => string
): string {
  switch (value) {
    case "tentcard":
      return tr("텐트카드", "Tent Card", "เทนท์การ์ด")
    case "standee":
      return tr("스탠디", "Standee", "สแตนดี้")
    case "coupon":
      return tr("쿠폰/전단", "Coupon/Flyer", "คูปอง/ใบปลิว")
    case "flyer":
      return tr("플라이어", "Flyer", "ใบปลิว")
    case "banner":
      return tr("배너", "Banner", "แบนเนอร์")
    case "prop":
      return tr("프롭", "Props", "พร็อพ")
    case "other":
      return tr("기타", "Other", "อื่นๆ")
    default:
      return value
  }
}

export function resolveMaterialTypeLabel(
  value: string,
  options: MarketingMaterialTypeOption[],
  tr: (ko: string, en: string, th: string) => string
): string {
  const opt = options.find((o) => o.value === value)
  if (opt) return opt.label
  return builtInMaterialTypeLabel(value, tr)
}

/** 셀렉트용: 목록에 없는 현재 값이면 임시 항목을 붙임 */
export function materialTypeSelectOptions(
  options: MarketingMaterialTypeOption[],
  currentValue: string,
  tr: (ko: string, en: string, th: string) => string
): MarketingMaterialTypeOption[] {
  const base = [...options]
  const cv = currentValue.trim()
  if (cv && !base.some((o) => o.value === cv)) {
    base.push({ value: cv, label: builtInMaterialTypeLabel(cv, tr) })
  }
  return base
}
