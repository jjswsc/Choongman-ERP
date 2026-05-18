/** Grab modifierGroups 버킷에 넣을 (그룹명, 옵션명) 분해 — POS 옵션 행 1개 기준 */

export type GrabModifierAssignInput = {
  name?: string
  option_step_values?: Record<string, string> | null
}

export type GrabModifierAssignment = {
  groupName: string
  optionName: string
}

function splitOptionGroupAndName(rawName: string): { groupName: string; optionName: string } {
  const src = String(rawName || "").trim()
  if (!src) return { groupName: "Options", optionName: "Option" }
  const separators = [":", " - ", " | ", "/", " > "]
  for (const sep of separators) {
    const idx = src.indexOf(sep)
    if (idx <= 0) continue
    const left = src.slice(0, idx).trim()
    const right = src.slice(idx + sep.length).trim()
    if (left && right) {
      return { groupName: left.slice(0, 60), optionName: right.slice(0, 100) }
    }
  }
  return { groupName: "Options", optionName: src.slice(0, 100) }
}

/**
 * option_step_values 가 여러 단계면 Grab modifier 그룹마다 1건씩 분리한다.
 * 단일 키·이름 파싱은 기존과 동일. 치킨 레거시 size+part 동시 키는 part만(Grab 정책).
 */
export function resolveGrabModifierAssignments(
  opt: GrabModifierAssignInput,
  menuCode: string | undefined,
  preferredGroupKeys: string[]
): GrabModifierAssignment[] {
  const originalName = String(opt.name ?? "").trim()
  const stepValues = opt.option_step_values
  if (stepValues && typeof stepValues === "object" && !Array.isArray(stepValues)) {
    const entries = Object.entries(stepValues).filter(
      ([k, v]) => String(k).trim() && String(v).trim()
    )
    if (entries.length > 1) {
      const isChicken = String(menuCode ?? "")
        .trim()
        .toLowerCase()
        .startsWith("c")
      /** 레거시 치킨 size+part 한 행만 part 그룹으로 (Grab에 size 단계 없음). part+sidedish 등은 아래 다중 분리 */
      if (isChicken) {
        const keys = entries.map(([k]) => String(k).trim().toLowerCase())
        const isLegacySizePart =
          keys.includes("size") &&
          keys.includes("part") &&
          keys.every((k) => k === "size" || k === "part")
        if (isLegacySizePart) {
          const partOnly = entries.filter(([k]) => String(k).trim().toLowerCase() === "part")
          if (partOnly.length === 1) {
            const [groupKey, optionValue] = partOnly[0]!
            return [
              {
                groupName: String(groupKey).trim(),
                optionName: String(optionValue).trim(),
              },
            ]
          }
        }
      }
      const order = preferredGroupKeys.map((k) => k.toLowerCase())
      const sorted = [...entries].sort(([ka], [kb]) => {
        const ia = order.indexOf(String(ka).trim().toLowerCase())
        const ib = order.indexOf(String(kb).trim().toLowerCase())
        const ai = ia === -1 ? 999 : ia
        const bi = ib === -1 ? 999 : ib
        if (ai !== bi) return ai - bi
        return String(ka).localeCompare(String(kb))
      })
      return sorted.map(([groupKey, optionValue]) => ({
        groupName: String(groupKey).trim(),
        optionName: String(optionValue).trim(),
      }))
    }
    if (entries.length === 1) {
      const [groupKey, optionValue] = entries[0]!
      return [
        {
          groupName: String(groupKey).trim(),
          optionName: String(optionValue).trim(),
        },
      ]
    }
  }
  const split = splitOptionGroupAndName(originalName)
  return [{ groupName: split.groupName, optionName: split.optionName }]
}

/** 링크 그룹으로 덮인 메뉴에, DB 단독 옵션을 추가로 포함할지 (POS getPosMenuOptions 와 동일 규칙) */
export function shouldIncludeStandaloneOptionForLinkedMenu(
  optionStepValues: Record<string, string> | null | undefined,
  linkedStepKeys: Set<string> | undefined
): boolean {
  if (!linkedStepKeys || linkedStepKeys.size === 0) return true
  if (!optionStepValues || Object.keys(optionStepValues).length === 0) return true
  return Object.keys(optionStepValues).some((k) => !linkedStepKeys.has(k))
}
