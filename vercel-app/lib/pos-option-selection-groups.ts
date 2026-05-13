import type { PosOptionSelectionGroupConfig } from "@/lib/api-client"

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
  return normalizeChickenOptionSelectionGroups(orderedDedup)
}

/** 단계 키 순서에 맞춰 option_selection_config 행을 맞춘다(누락 키는 기본값). */
export function syncOptionSelectionConfigToGroupKeys(
  groups: string[],
  existing?: PosOptionSelectionGroupConfig[] | null
): PosOptionSelectionGroupConfig[] {
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
