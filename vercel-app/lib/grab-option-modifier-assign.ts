import {
  isChickenDefaultOptionName,
  isFlatChickenMListOptionName,
} from "@/lib/pos-chicken-option-inference"

/** Grab modifierGroups 버킷에 넣을 (그룹명, 옵션명) 분해 — POS 옵션 행 1개 기준 */

export type GrabModifierAssignInput = {
  name?: string
  option_step_values?: Record<string, string> | null
}

export type GrabModifierAssignment = {
  groupName: string
  optionName: string
}

/** Grab 손님 앱 — 치킨 size/part 한 목록 제목. `part`면 추가 구매로 오해됨. */
export const GRAB_CHICKEN_SIZE_GROUP_DISPLAY_NAME = "เลือกขนาด"

/** POS에는 S가 기본가라 옵션 행이 없어도, Grab에서는 손님이 직접 고를 수 있게 넣는다. */
export const GRAB_CHICKEN_DEFAULT_SIZE_OPTION_NAME = "S - Boneless"
export const GRAB_CHICKEN_DEFAULT_SIZE_OPTION_DESC = "ไม่มีกระดูก 5 ชิ้น 175 g."

const GENERIC_CHICKEN_SIZE_GROUP_LABELS = new Set([
  "part",
  "size",
  "부위",
  "사이즈",
  "ส่วน",
  "ไซส์",
])

function isChickenMenuCode(code: string | undefined): boolean {
  return String(code ?? "")
    .trim()
    .toLowerCase()
    .startsWith("c")
}

function isChickenPartOrSizeKey(groupKey: string): boolean {
  const key = String(groupKey ?? "").trim().toLowerCase()
  return key === "part" || key === "size"
}

/** 치킨 size/part 한 줄은 Grab에 S/M 이름을 유지한다. 부위값만 내면 Boneless +110이 추가 구매처럼 보인다. */
export function grabChickenPartSizeOptionName(params: {
  originalName: string
  groupKey: string
  stepValue: string
  sizeValue?: string
  partValue?: string
}): string {
  if (!isChickenPartOrSizeKey(params.groupKey)) return params.stepValue
  const original = String(params.originalName ?? "").trim()
  if (original) return original
  const size = String(params.sizeValue ?? "").trim()
  const part = String(params.partValue ?? "").trim()
  if (size && part) return `${size} - ${part}`
  return String(params.stepValue ?? "").trim()
}

/** Grab 손님 앱에서 S/M 한 목록으로 다루는 그룹. size 단계가 남아 있으면 제목이 겹치지 않게 part만. */
export function isGrabChickenSizeChoiceGroup(groupName: string): boolean {
  return String(groupName ?? "").trim().toLowerCase() === "part"
}

export function resolveGrabChickenSizeGroupDisplayName(label: string, groupKey: string): string {
  const raw = String(label || groupKey || "").trim()
  if (!raw || GENERIC_CHICKEN_SIZE_GROUP_LABELS.has(raw.toLowerCase()) || GENERIC_CHICKEN_SIZE_GROUP_LABELS.has(raw)) {
    return GRAB_CHICKEN_SIZE_GROUP_DISPLAY_NAME
  }
  return raw.slice(0, 60)
}

export function applyGrabChickenSizeChoiceGroupMeta(params: {
  groupName: string
  label?: string
  min: number
  max: number
}): { min: number; max: number; groupDisplayName: string } {
  const fallback = String(params.label || params.groupName || "Options").trim() || "Options"
  if (!isGrabChickenSizeChoiceGroup(params.groupName)) {
    return {
      min: params.min,
      max: params.max,
      groupDisplayName: fallback.slice(0, 60),
    }
  }
  return {
    min: Math.max(1, params.min),
    max: params.max,
    groupDisplayName: resolveGrabChickenSizeGroupDisplayName(params.label || "", params.groupName),
  }
}

export function dedupeGrabChickenDefaultOptionRows<T extends {
  name?: string
  description_delivery?: string | null
  description_default?: string | null
}>(rows: T[]): T[] {
  const defaultIdx: number[] = []
  for (let i = 0; i < rows.length; i++) {
    if (isChickenDefaultOptionName(rows[i]?.name)) defaultIdx.push(i)
  }
  if (defaultIdx.length <= 1) return rows
  let keep = defaultIdx[0]!
  let bestScore = -1
  for (const i of defaultIdx) {
    const d = String(rows[i]?.description_delivery ?? rows[i]?.description_default ?? "").trim()
    if (d.length > bestScore) {
      bestScore = d.length
      keep = i
    }
  }
  const drop = new Set(defaultIdx.filter((i) => i !== keep))
  return rows.filter((_, i) => !drop.has(i))
}

export function sortGrabChickenSizeChoiceRows<T extends { name?: string; sort_order?: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aDefault = isChickenDefaultOptionName(a.name) ? 0 : 1
    const bDefault = isChickenDefaultOptionName(b.name) ? 0 : 1
    if (aDefault !== bDefault) return aDefault - bDefault
    const ao = Number(a.sort_order ?? 0)
    const bo = Number(b.sort_order ?? 0)
    if (ao !== bo) return ao - bo
    return String(a.name ?? "").localeCompare(String(b.name ?? ""))
  })
}

type GrabChickenSizeOptionRow = {
  name?: string
  price_modifier?: number
  price_modifier_delivery?: number | null
  sort_order?: number
  description_delivery?: string | null
  description_default?: string | null
}

export function grabChickenSizeChoiceNeedsDefaultS<T extends { name?: string }>(rows: T[]): boolean {
  if (rows.some((r) => isChickenDefaultOptionName(r.name))) return false
  return rows.some((r) => isFlatChickenMListOptionName(r.name))
}

/** M만 있으면 S(0원)를 앞에 넣는다. ERP는 S를 기본가로 숨기므로 Grab 행이 비는 경우가 있다. */
export function injectGrabChickenDefaultSizeOption<T extends GrabChickenSizeOptionRow>(rows: T[]): T[] {
  if (!grabChickenSizeChoiceNeedsDefaultS(rows)) return rows
  const injected = {
    name: GRAB_CHICKEN_DEFAULT_SIZE_OPTION_NAME,
    price_modifier: 0,
    price_modifier_delivery: 0,
    sort_order: -1,
    description_delivery: GRAB_CHICKEN_DEFAULT_SIZE_OPTION_DESC,
  } as T
  return [injected, ...rows]
}

export function finalizeGrabChickenSizeChoiceRows<T extends GrabChickenSizeOptionRow>(rows: T[]): T[] {
  return sortGrabChickenSizeChoiceRows(
    dedupeGrabChickenDefaultOptionRows(injectGrabChickenDefaultSizeOption(rows))
  )
}

/** leftover size 그룹의 S를 part(เลือกขนาด)로 옮긴다. 두 그룹으로 쪼개지면 S가 안 보인다. */
export function pullGrabChickenDefaultOptionsFromSizeGroup<T extends { name?: string }>(
  partRows: T[],
  sizeRows: T[]
): { partRows: T[]; sizeRows: T[] } {
  const defaults = sizeRows.filter((r) => isChickenDefaultOptionName(r.name))
  if (defaults.length === 0) return { partRows, sizeRows }
  return {
    partRows: [...defaults, ...partRows],
    sizeRows: sizeRows.filter((r) => !isChickenDefaultOptionName(r.name)),
  }
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
 * 단일 키·이름 파싱은 기존과 동일. 치킨 레거시 size+part 는 한 그룹(part)으로 보내되
 * 옵션 이름은 S/M 을 유지한다(Grab에 Size 단계를 따로 두지 않음).
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
            const sizeValue = String(
              entries.find(([k]) => String(k).trim().toLowerCase() === "size")?.[1] ?? ""
            ).trim()
            return [
              {
                groupName: String(groupKey).trim(),
                optionName: grabChickenPartSizeOptionName({
                  originalName,
                  groupKey: String(groupKey).trim(),
                  stepValue: String(optionValue).trim(),
                  sizeValue,
                  partValue: String(optionValue).trim(),
                }),
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
      const key = String(groupKey).trim()
      const value = String(optionValue).trim()
      return [
        {
          groupName: key,
          optionName: isChickenMenuCode(menuCode)
            ? grabChickenPartSizeOptionName({
                originalName,
                groupKey: key,
                stepValue: value,
                partValue: key.toLowerCase() === "part" ? value : undefined,
                sizeValue: key.toLowerCase() === "size" ? value : undefined,
              })
            : value,
        },
      ]
    }
  }
  const split = splitOptionGroupAndName(originalName)
  return [{ groupName: split.groupName, optionName: split.optionName }]
}

/**
 * Grab 손님 앱 modifier 이름 — 그룹 제목(sidedish, M 등)과 중복되지 않게 옵션값만.
 * (그룹 헤더는 Grab이 modifierGroup.name 으로 이미 표시)
 */
export function formatGrabModifierOptionDisplayName(groupName: string, optionName: string): string {
  const g = String(groupName || "").trim()
  let o = String(optionName || "").trim()
  if (!o) return o
  if (!g || g.toLowerCase() === "options") return o
  const gl = g.toLowerCase()
  const ol = o.toLowerCase()
  if (ol === gl) return o
  for (const prefix of [`${gl} - `, `${gl}: `, `${gl} `, `${gl}/`, `${gl}|`]) {
    if (ol.startsWith(prefix)) {
      o = o.slice(prefix.length).trim()
      break
    }
  }
  return o
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
