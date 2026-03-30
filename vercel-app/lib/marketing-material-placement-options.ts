/**
 * 홍보물 매장 위치(placement_spots) 선택지 — 브라우저 localStorage.
 */

const STORAGE_KEY = "cm_marketing_material_placements_v1"

export type MarketingMaterialPlacementOption = { value: string; label: string }

export const DEFAULT_MARKETING_MATERIAL_PLACEMENTS: MarketingMaterialPlacementOption[] = [
  { value: "counter", label: "카운터" },
  { value: "tv", label: "TV" },
  { value: "table", label: "테이블" },
  { value: "entrance", label: "입구" },
]

/** 기본 제공 매장 위치 — 저장된 label과 무관하게 UI 언어로 표시 */
export const BUILTIN_MARKETING_MATERIAL_PLACEMENT_VALUES = new Set(
  DEFAULT_MARKETING_MATERIAL_PLACEMENTS.map((x) => x.value)
)

export function defaultMarketingMaterialPlacementOptions(): MarketingMaterialPlacementOption[] {
  return DEFAULT_MARKETING_MATERIAL_PLACEMENTS.map((x) => ({ ...x }))
}

function slugFromLabel(label: string): string {
  const s = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
  return s || "spot"
}

export function newPlacementValue(label: string, existingValues: string[]): string {
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

function parseStored(raw: string | null): MarketingMaterialPlacementOption[] | null {
  if (!raw?.trim()) return null
  try {
    const j = JSON.parse(raw) as unknown
    if (!Array.isArray(j)) return null
    const out: MarketingMaterialPlacementOption[] = j
      .map((x) => {
        if (x && typeof x === "object" && "value" in x && "label" in x) {
          const value = String((x as { value: unknown }).value ?? "").trim()
          const label = String((x as { label: unknown }).label ?? "").trim()
          if (!value || !label) return null
          return { value, label }
        }
        return null
      })
      .filter(Boolean) as MarketingMaterialPlacementOption[]
    return out.length ? out : null
  } catch {
    return null
  }
}

export function loadMarketingMaterialPlacementOptions(): MarketingMaterialPlacementOption[] {
  if (typeof window === "undefined") return defaultMarketingMaterialPlacementOptions()
  const parsed = parseStored(window.localStorage.getItem(STORAGE_KEY))
  return parsed ?? defaultMarketingMaterialPlacementOptions()
}

export function saveMarketingMaterialPlacementOptions(opts: MarketingMaterialPlacementOption[]): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(opts))
  } catch {
    /* ignore quota */
  }
}

export function builtInPlacementLabel(
  value: string,
  tr: (ko: string, en: string, th: string) => string
): string {
  switch (value) {
    case "counter":
      return tr("카운터", "Counter", "เคาน์เตอร์")
    case "tv":
      return tr("TV", "TV", "ทีวี")
    case "table":
      return tr("테이블", "Table", "โต๊ะ")
    case "entrance":
      return tr("입구", "Entrance", "ทางเข้า")
    default:
      return value
  }
}

export function resolvePlacementLabel(
  value: string,
  options: MarketingMaterialPlacementOption[],
  tr: (ko: string, en: string, th: string) => string
): string {
  const v = String(value ?? "").trim()
  if (BUILTIN_MARKETING_MATERIAL_PLACEMENT_VALUES.has(v)) {
    return builtInPlacementLabel(v, tr)
  }
  const opt = options.find((o) => o.value === v)
  if (opt) return opt.label
  return builtInPlacementLabel(v, tr)
}
