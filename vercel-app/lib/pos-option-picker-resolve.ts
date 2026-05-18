import type { PosMenuOption } from "@/lib/api-client"
import {
  collectPosOptionPickerStepValues,
  inferChickenOptionPartValue,
  inferChickenOptionSizeValue,
  isChickenDefaultOptionName,
  isChickenMenuCodeForOptions,
} from "@/lib/pos-chicken-option-inference"
import { posOptionRowMatchesPickerSelections } from "@/lib/pos-option-step-selection-match"

function stepValueForMatch(
  opt: PosMenuOption,
  groupKey: string,
  menuCode: string | undefined
): string {
  const direct = String(opt.optionStepValues?.[groupKey] ?? "").trim()
  if (direct) return direct
  if (!isChickenMenuCodeForOptions(menuCode)) return ""
  if (groupKey === "part") return inferChickenOptionPartValue(opt)
  if (groupKey === "size") return inferChickenOptionSizeValue(opt)
  return ""
}

/**
 * 다단계 선택 완료 후 장바구니에 넣을 옵션 행.
 * 1) 한 행에 모든 단계가 있는 경우
 * 2) 링크 그룹별 단일 키 행을 조합해 합성 (가격·표시명 합산)
 */
export function resolvePosOptionPickerMatch(params: {
  menuCode: string | undefined
  groups: string[]
  selections: Record<string, string | undefined>
  optionsWithSteps: PosMenuOption[]
  allOptions: PosMenuOption[]
  groupConfigByKey: Map<string, { required?: boolean } | undefined>
}): PosMenuOption | null {
  const { menuCode, groups, selections, optionsWithSteps, allOptions, groupConfigByKey } = params

  const full = optionsWithSteps.find((o) =>
    posOptionRowMatchesPickerSelections(o.optionStepValues, groups, selections, groupConfigByKey)
  )
  if (full) return full

  const requiredGroups = groups.filter((g) => {
    const cfg = groupConfigByKey.get(g)
    const optional = cfg?.required === false
    const sel = selections[g]
    if (optional && (sel === undefined || sel === null || String(sel).trim() === "")) return false
    return true
  })

  const perGroup: PosMenuOption[] = []
  for (const g of requiredGroups) {
    const sel = String(selections[g] ?? "").trim()
    if (!sel) return null
    const row =
      optionsWithSteps.find((o) => stepValueForMatch(o, g, menuCode) === sel) ??
      allOptions.find(
        (o) =>
          o.optionType === "substitution" &&
          !isChickenDefaultOptionName(o.name) &&
          stepValueForMatch(o, g, menuCode) === sel
      )
    if (!row) return null
    perGroup.push(row)
  }
  if (perGroup.length === 0) return null
  if (perGroup.length === 1) return perGroup[0]!

  const stepValues: Record<string, string> = {}
  for (const g of requiredGroups) {
    stepValues[g] = String(selections[g] ?? "").trim()
  }
  const name = requiredGroups.map((g) => stepValues[g]).join(" - ")
  const priceModifier = perGroup.reduce((s, o) => s + (Number(o.priceModifier) || 0), 0)
  const priceModifierDelivery = perGroup.some((o) => o.priceModifierDelivery != null)
    ? perGroup.reduce((s, o) => s + (Number(o.priceModifierDelivery ?? o.priceModifier) || 0), 0)
    : null

  return {
    id: perGroup.map((o) => o.id).join("+"),
    menuId: perGroup[0]!.menuId,
    optionCode: perGroup.map((o) => o.optionCode).filter(Boolean).join("+") || undefined,
    name,
    priceModifier,
    priceModifierDelivery,
    priceModifierPackaging: null,
    sortOrder: Math.min(...perGroup.map((o) => Number(o.sortOrder) || 0)),
    optionType: "substitution",
    optionStepValues: stepValues,
    sellHall: perGroup.every((o) => o.sellHall !== false),
    sellDelivery: perGroup.every((o) => o.sellDelivery !== false),
    sellPackaging: perGroup.every((o) => o.sellPackaging !== false),
  }
}

export { collectPosOptionPickerStepValues }
