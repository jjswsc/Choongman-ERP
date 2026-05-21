import type { PosMenuOption } from "@/lib/api-client"

const CHICKEN_CODE_PREFIX = "c"

export function isChickenMenuCodeForOptions(code: string | undefined): boolean {
  return String(code ?? "")
    .trim()
    .toLowerCase()
    .startsWith(CHICKEN_CODE_PREFIX)
}

/** 치킨 기본 옵션(S Boneless): 목록·다단계 선택에서 제외 */
export function isChickenDefaultOptionName(name: string | undefined): boolean {
  if (!name?.trim()) return false
  const n = name.trim()
  return (
    /^S\s*[-]?\s*순살\s*$/i.test(n) ||
    /^S\s*[-]?\s*boneless\s*$/i.test(n) ||
    n === "S 순살" ||
    n === "S - 순살" ||
    n === "S-순살" ||
    n === "S Boneless" ||
    n === "S - Boneless" ||
    n === "S-Boneless"
  )
}

export function isSizePartOptionGroups(groups: string[]): boolean {
  return groups.length === 2 && groups[0] === "size" && groups[1] === "part"
}

function isMNamedChickenOptionName(name: string | undefined): boolean {
  return /^\s*M\s*[-–—]/i.test(String(name ?? "").trim())
}

export function isFlatChickenMListOptionName(name: string | undefined): boolean {
  return isMNamedChickenOptionName(name)
}

export function filterFlatChickenMListOptions<T extends Pick<PosMenuOption, "name" | "optionType">>(
  options: T[]
): T[] {
  return options.filter(
    (o) =>
      o.optionType === "substitution" &&
      !isChickenDefaultOptionName(o.name) &&
      isFlatChickenMListOptionName(o.name)
  )
}

export function inferChickenOptionSizeValue(o: Pick<PosMenuOption, "name" | "optionStepValues">): string {
  const fromStep = String(o.optionStepValues?.size ?? "").trim()
  if (fromStep) return fromStep
  const name = String(o.name ?? "").trim()
  const m = name.match(/^\s*([SML])(?:\s*[-–—]\s*|\s+$|\b)/i)
  if (m) return m[1].toUpperCase()
  return ""
}

export function inferChickenOptionPartValue(o: Pick<PosMenuOption, "name" | "optionStepValues">): string {
  const fromStep = String(o.optionStepValues?.part ?? "").trim()
  if (fromStep) return fromStep
  const name = String(o.name ?? "").trim()
  let rest = name.replace(/^\s*[SML]\s*[-–—]\s*/i, "").trim()
  if (!rest) rest = name.replace(/^\s*[SML]\s+/i, "").trim()
  if (rest) return rest
  if (name && !/^\s*[SML]\b/i.test(name)) return name
  return ""
}

/**
 * size/part 외 단계(sidedish 등)가 있으면 이름만으로 part 추론을 제한한다.
 * 레거시 M-Wing·size 스텝이 있을 때만 이름에서 part 추론.
 */
export function shouldInferChickenPartFromName(
  o: Pick<PosMenuOption, "name" | "optionStepValues">,
  stepGroups: string[]
): boolean {
  if (isSizePartOptionGroups(stepGroups)) return true
  if (stepGroups.length === 1 && stepGroups[0] === "part") return true
  if (stepGroups.length > 0 && stepGroups.every((k) => k === "size" || k === "part")) return true
  if (inferChickenOptionSizeValue(o)) return true
  if (/^\s*[SML](?:\s*[-–—]|\s+|\b)/i.test(String(o.name ?? "").trim())) return true
  return false
}

function optionStepValueForPicker(
  opt: PosMenuOption,
  groupKey: string,
  menuCode: string | undefined,
  stepGroups: string[]
): string {
  if (isChickenMenuCodeForOptions(menuCode) && isSizePartOptionGroups(stepGroups)) {
    if (groupKey === "size") return inferChickenOptionSizeValue(opt)
    if (groupKey === "part") return inferChickenOptionPartValue(opt)
  }
  if (isChickenMenuCodeForOptions(menuCode) && groupKey === "part" && stepGroups.includes("part")) {
    const direct = String(opt.optionStepValues?.part ?? "").trim()
    if (direct) return direct
    if (!shouldInferChickenPartFromName(opt, stepGroups)) return ""
    return inferChickenOptionPartValue(opt)
  }
  if (isChickenMenuCodeForOptions(menuCode) && groupKey === "size" && stepGroups.includes("size")) {
    const direct = String(opt.optionStepValues?.size ?? "").trim()
    if (direct) return direct
    return inferChickenOptionSizeValue(opt)
  }
  return String(opt.optionStepValues?.[groupKey] ?? "").trim()
}

/** POS 옵션 다이얼로그: 단계별 선택 버튼 값 목록 */
export function collectPosOptionPickerStepValues(params: {
  groupKey: string
  groups: string[]
  menuCode: string | undefined
  options: PosMenuOption[]
  /** option_step_values 가 있는 행만 (기존 필터) */
  optionsWithSteps: PosMenuOption[]
  isChickenMenu: boolean
}): string[] {
  const { groupKey, groups, menuCode, options, optionsWithSteps, isChickenMenu } = params
  const fromSteps = [
    ...new Set(
      optionsWithSteps
        .map((o) => optionStepValueForPicker(o, groupKey, menuCode, groups))
        .filter(Boolean)
    ),
  ]
  if (fromSteps.length > 0) return fromSteps

  if (!isChickenMenu) return fromSteps

  const pool = options.filter((o) => o.optionType === "substitution" && !isChickenDefaultOptionName(o.name))
  if (groupKey === "part") {
    return [
      ...new Set(
        pool
          .map((o) => optionStepValueForPicker(o, "part", menuCode, groups))
          .filter(Boolean)
      ),
    ]
  }
  if (groupKey === "size") {
    return [
      ...new Set(
        pool
          .map((o) => optionStepValueForPicker(o, "size", menuCode, groups))
          .filter(Boolean)
      ),
    ]
  }
  return fromSteps
}

/**
 * 레거시 치킨 옵션(이름: `M - Boneless` 등)이 일부 메뉴만 step 값(part)으로 저장된 경우,
 * 같은 카테고리 메뉴라도 옵션 UI가 `M 목록` vs `part 목록`으로 갈라진다.
 * size 그룹이 없고 M-이름 옵션이 주류인 메뉴는 평면 목록으로 강제해 메뉴 간 UI를 맞춘다.
 */
export function shouldUseFlatChickenMOptionPicker(params: {
  menuCode: string | undefined
  groups: string[]
  options: PosMenuOption[]
  optionsWithSteps: PosMenuOption[]
}): boolean {
  const { menuCode, groups, options, optionsWithSteps } = params
  if (!isChickenMenuCodeForOptions(menuCode)) return false
  if (!Array.isArray(groups) || groups.length === 0) return false
  if (groups.includes("size")) return false
  const substitutions = options.filter(
    (o) => o.optionType === "substitution" && !isChickenDefaultOptionName(o.name)
  )
  if (substitutions.length === 0) return false
  const mNamedCount = substitutions.filter((o) => isMNamedChickenOptionName(o.name)).length
  if (mNamedCount === 0) return false
  const mRatio = mNamedCount / substitutions.length
  if (mRatio < 0.6) return false
  if (optionsWithSteps.length === 0) return false
  const hasExplicitSizeStep = optionsWithSteps.some(
    (o) => String(o.optionStepValues?.size ?? "").trim().length > 0
  )
  if (hasExplicitSizeStep) return false
  return true
}
