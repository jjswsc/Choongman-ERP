import type { PosOptionSelectionGroupConfig } from "@/lib/api-client"
import {
  isStrictBonelessBbqChickenCode,
  normalizeBbqChickenOptionSelectionGroups,
} from "@/lib/pos-bbq-option-guard"

const CHICKEN_CODE_PREFIX = "c"

export function isChickenMenuCode(code: string | undefined): boolean {
  return String(code ?? "")
    .trim()
    .toLowerCase()
    .startsWith(CHICKEN_CODE_PREFIX)
}

/**
 * 치킨 메뉴: `part` 단계는 항상 포함. `size`가 있으면 `size, part` 순으로 고정한 뒤 나머지 키는 뒤에 둔다.
 * 비치킨은 호출하지 말 것.
 */
export function normalizeChickenOptionSelectionGroups(groups: string[]): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const x of groups || []) {
    const k = String(x ?? "").trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    keys.push(k)
  }
  if (keys.length === 0) return ["part"]
  let withPart = keys
  if (!keys.includes("part")) {
    withPart = ["part", ...keys]
  }
  if (withPart.includes("size") && withPart.includes("part")) {
    const rest = withPart.filter((k) => k !== "size" && k !== "part")
    return ["size", "part", ...rest]
  }
  const rest = withPart.filter((k) => k !== "part")
  return ["part", ...rest]
}

/** 메뉴 코드 기준 옵션 단계 키 목록 정규화 (치킨은 part 보장 + size/part 순서) */
export function normalizeOptionGroupsForMenu(groups: string[], menuCode: string | undefined): string[] {
  const orderedDedup: string[] = []
  const seen = new Set<string>()
  for (const x of groups || []) {
    const k = String(x ?? "").trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    orderedDedup.push(k)
  }
  if (!isChickenMenuCode(menuCode)) return orderedDedup
  if (isStrictBonelessBbqChickenCode(menuCode)) {
    return normalizeBbqChickenOptionSelectionGroups(orderedDedup)
  }
  return normalizeChickenOptionSelectionGroups(orderedDedup)
}

/** `buildSelectionConfigFromLinks` 결과와 동일한 정규화된 단계 설정(항상 label·audience·min/max 확정). */
export type ResolvedPosOptionSelectionGroupConfig = {
  key: string
  label: string
  audience: 'all' | 'hall' | 'delivery'
  required: boolean
  minSelect: number
  maxSelect: number
}

/** 단계 키 순서에 맞춰 option_selection_config 행을 맞춘다(누락 키는 기본값). */
export function syncOptionSelectionConfigToGroupKeys(
  groups: string[],
  existing?: PosOptionSelectionGroupConfig[] | null
): ResolvedPosOptionSelectionGroupConfig[] {
  const byKey = new Map<string, PosOptionSelectionGroupConfig>()
  for (const row of existing || []) {
    const key = String(row?.key ?? "").trim()
    if (!key) continue
    byKey.set(key, row)
  }
  return groups.map((key) => {
    const prev = byKey.get(key)
    const required = prev?.required !== false
    const audience =
      prev?.audience === "delivery" || prev?.audience === "hall" ? prev.audience : "all"
    const minFromPrev = prev?.minSelect
    const maxFromPrev = prev?.maxSelect
    let minSelect =
      minFromPrev != null && Number.isFinite(Number(minFromPrev))
        ? Math.max(0, Math.floor(Number(minFromPrev)))
        : required
          ? 1
          : 0
    const maxSelect =
      maxFromPrev != null && Number.isFinite(Number(maxFromPrev))
        ? Math.max(1, Math.floor(Number(maxFromPrev)))
        : 1
    if (minSelect > maxSelect) minSelect = maxSelect
    return {
      key,
      label: String(prev?.label ?? key).trim() || key,
      audience,
      required,
      minSelect,
      maxSelect,
    }
  })
}

function parseAudienceFromDb(raw: unknown): "all" | "hall" | "delivery" {
  const audienceRaw = String(raw ?? "all").trim().toLowerCase()
  return audienceRaw === "hall" || audienceRaw === "delivery" ? audienceRaw : "all"
}

/** DB `option_selection_config` jsonb → POS 단계 설정( audience 포함 ). */
export function parseOptionSelectionConfigFromDb(c: unknown): ResolvedPosOptionSelectionGroupConfig[] {
  let arr: unknown[] = []
  if (Array.isArray(c)) arr = c
  else if (c && typeof c === "string") {
    try {
      const parsed = JSON.parse(c) as unknown
      if (Array.isArray(parsed)) arr = parsed
    } catch {
      /* ignore */
    }
  }
  return arr
    .map((cfg) => {
      if (!cfg || typeof cfg !== "object") return null
      const o = cfg as Record<string, unknown>
      const key = String(o.key ?? "").trim()
      if (!key) return null
      const label = String(o.label ?? "").trim()
      const minRaw = Number(o.minSelect)
      const maxRaw = Number(o.maxSelect)
      const required = o.required === true
      const minSelect = Number.isFinite(minRaw) ? Math.max(0, Math.floor(minRaw)) : required ? 1 : 0
      const maxSelect = Number.isFinite(maxRaw) ? Math.max(1, Math.floor(maxRaw)) : 1
      const audience = parseAudienceFromDb(o.audience)
      return {
        key,
        label: label || key,
        audience,
        required,
        minSelect: Math.min(minSelect, maxSelect),
        maxSelect,
      }
    })
    .filter((x): x is ResolvedPosOptionSelectionGroupConfig => !!x)
}

export function resolveStepAudienceFromOrderType(orderType: string): "hall" | "delivery" {
  const ot = String(orderType ?? "").trim().toLowerCase()
  return ot === "delivery" ? "delivery" : "hall"
}

export function isGroupVisibleForStepAudience(
  audience: "all" | "hall" | "delivery" | undefined,
  stepAudience: "hall" | "delivery"
): boolean {
  return !audience || audience === "all" || audience === stepAudience
}

export function filterOptionSelectionGroupsForAudience(
  groups: string[],
  groupConfigByKey: Map<string, Pick<PosOptionSelectionGroupConfig, "audience"> | undefined>,
  stepAudience: "hall" | "delivery"
): string[] {
  const normalizeAudienceKey = (raw: string) => String(raw ?? "").trim().toLowerCase()
  const byNormalizedKey = new Map<string, Pick<PosOptionSelectionGroupConfig, "audience"> | undefined>()
  for (const [key, cfg] of groupConfigByKey.entries()) {
    const nk = normalizeAudienceKey(key)
    if (!nk || byNormalizedKey.has(nk)) continue
    byNormalizedKey.set(nk, cfg)
  }
  return groups.filter((key) => {
    const cfg = groupConfigByKey.get(key) ?? byNormalizedKey.get(normalizeAudienceKey(key))
    return isGroupVisibleForStepAudience(cfg?.audience, stepAudience)
  })
}

/** 단계 키가 숨겨진 채널에만 속한 옵션(복합·단일 단계)은 목록에서 제외한다. */
export function filterPosOptionsForVisibleGroups<T extends { optionStepValues?: Record<string, string> | null }>(
  options: T[],
  visibleGroupKeys: ReadonlySet<string>
): T[] {
  return options.filter((o) => {
    const sv = o.optionStepValues
    if (!sv || typeof sv !== "object") return true
    const keys = Object.keys(sv)
      .map((k) => k.trim())
      .filter(Boolean)
    if (keys.length === 0) return true
    return keys.every((k) => visibleGroupKeys.has(k))
  })
}

/** option_step_values에서 단계 키를 추론(메뉴 저장 누락 복구용) */
export function inferOptionSelectionGroupsFromOptions<T extends { optionStepValues?: Record<string, string> | null }>(
  options: T[],
  menuCode: string | undefined
): string[] {
  const keys: string[] = []
  const seen = new Set<string>()
  for (const row of options || []) {
    const sv = row?.optionStepValues
    if (!sv || typeof sv !== "object") continue
    for (const rawKey of Object.keys(sv)) {
      const key = String(rawKey ?? "").trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      keys.push(key)
    }
  }
  if (keys.length === 0) return []
  return normalizeOptionGroupsForMenu(keys, menuCode)
}
