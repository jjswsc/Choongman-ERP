import type { PosMenu, PosOptionGroup } from "@/lib/api-client"

export type KitchenSlipOptionGroupChoice = {
  key: string
  label: string
}

/** 주방 슬립 필터·저장 정책과 동일한 키 정규화 */
export function normalizeKitchenOptionGroupKey(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
}

/**
 * 프린터 설정 UI용 옵션 그룹 목록.
 * 1) pos_option_groups 마스터 2) 메뉴 option_selection_groups/config 에서 쓰는 단계 키 병합
 */
export function buildKitchenSlipOptionGroupChoices(
  optionGroups: PosOptionGroup[],
  menus: PosMenu[]
): KitchenSlipOptionGroupChoice[] {
  const byKey = new Map<string, string>()

  const add = (rawKey: string, rawLabel?: string) => {
    const key = normalizeKitchenOptionGroupKey(rawKey)
    if (!key) return
    const label = String(rawLabel ?? rawKey).trim() || key
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, label)
      return
    }
    if (prev === key && label !== key) byKey.set(key, label)
  }

  for (const g of optionGroups || []) {
    add(String(g.key ?? ""), String(g.name ?? ""))
  }

  for (const m of menus || []) {
    for (const k of m.optionSelectionGroups || []) {
      add(String(k ?? ""))
    }
    for (const cfg of m.optionSelectionConfig || []) {
      add(String(cfg?.key ?? ""), String(cfg?.label ?? ""))
    }
  }

  return [...byKey.entries()]
    .map(([key, label]) => ({ key, label }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }))
}
