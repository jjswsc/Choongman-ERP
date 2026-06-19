/**
 * POS 메뉴 관리 페이지 — 순수 헬퍼·상수·타입 (page.tsx에서 분리 — move only)
 * 로직 변경 없음. import 경로만 분리.
 */
import {
  type PosMenu,
  type PosMenuOption,
  type PosOptionSelectionGroupConfig,
  type PosPackagingChecklistOrderType,
} from "@/lib/api-client"
import { normalizeOptionGroupsForMenu } from "@/lib/pos-option-selection-groups"

/** 원가 분석 화면 이동 후 복귀 시 편집 중이던 메뉴·노출 매장 복원 */
export const POS_MENUS_EDIT_RESUME_KEY = "cm_pos_menus_edit_resume_v1"

export function menuScopeStoreCodes(menu: PosMenu): string[] {
  return Array.isArray(menu.storeCodes)
    ? menu.storeCodes.map((x) => String(x || "").trim()).filter(Boolean)
    : []
}

export function storeScopeCodesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const norm = (xs: string[]) => [...xs].map((x) => x.toLowerCase()).sort()
  const sa = norm(a)
  const sb = norm(b)
  return sa.every((v, i) => v === sb[i])
}

/** 코드 자동 생성 대상 대분류 (C/K/S/D/T 접두사) */
export const CODE_AUTO_MAINS = ["Chicken", "Korean", "Side", "Drinks", "Topping"] as const

/** 옵션관리 탭: 고정 2단계 — 1. 사이즈, 2. 부위 */
export const OPTION_SIZE_VALUES = ["S", "M", "L"]
export const OPTION_PART_VALUES = ["Boneless", "Wing", "Drumette"] as const
/** 치킨 메뉴: 코드가 c로 시작. 기본가=S Boneless, 옵션은 M Boneless·Wing·Drumette 조합 */
export const CHICKEN_CODE_PREFIX = "c"
/** 치킨 size/part 단계의 공통 표시 제목(영문 고정). 세부 구분은 · 뒤에 사이즈/부위 라벨로 표시 */
export const CHICKEN_OPTION_GROUP_TITLE = "chicken size"

/** 옵션 일괄 추가「메뉴 검색·선택」: 좌측 메뉴 목록과 동일한 `코드 — 이름` 표기 */
export function formatPosMenuBulkPickLabel(m: PosMenu): string {
  const c = String(m.code ?? "").trim()
  const n = String(m.name ?? "").trim()
  if (c && n) return `${c} — ${n}`
  return n || c
}

export function formatChickenOptionStepDisplayLabel(stepKey: "size" | "part", t: (key: string) => string): string {
  const suffix = stepKey === "size" ? t("posOptionGroupSize") : t("posOptionGroupPart")
  return `${CHICKEN_OPTION_GROUP_TITLE} · ${suffix}`
}

/** 사용자가 그룹 표시명을 직접 넣었는지(기본값/빈 값/step키와 동일이면 미설정으로 본다) */
export function hasCustomGroupLabel(row: PosOptionSelectionGroupConfig, t: (key: string) => string): boolean {
  const label = String(row?.label ?? "").trim()
  if (!label) return false
  const key = String(row?.key ?? "").trim()
  if (label.toLowerCase() === key.toLowerCase()) return false
  if (key === "size" && label === formatChickenOptionStepDisplayLabel("size", t)) return false
  if (key === "part" && label === formatChickenOptionStepDisplayLabel("part", t)) return false
  if (key === "part" && label === (t("posOptionGroupPart") || "부위")) return false
  return true
}

/**
 * 치킨(c)·size+part 단계일 때 option_selection_config.label 을 통일 형식으로 덮어씀.
 * 단, 사용자가 그룹 표시명을 직접 입력한 행은 그 값을 유지한다(Grab 배달 그룹명 커스텀 허용).
 */
export function applyChickenOptionGroupLabelsToConfig(
  groups: string[],
  normalizedConfig: PosOptionSelectionGroupConfig[],
  menuCode: string | undefined,
  t: (key: string) => string
): PosOptionSelectionGroupConfig[] {
  if (!isChickenMenu(menuCode) || !isSizePartGroups(groups)) return normalizedConfig
  return normalizedConfig.map((row) => {
    if (hasCustomGroupLabel(row, t)) return row
    if (row.key === "size") return { ...row, label: formatChickenOptionStepDisplayLabel("size", t) }
    if (row.key === "part") return { ...row, label: formatChickenOptionStepDisplayLabel("part", t) }
    return row
  })
}

/** 치킨(c) size/part는 공통 규칙으로 통일: size 단계는 배달 전용 + 단일 선택 */
export function applyChickenDeliveryRulesToConfig(
  groups: string[],
  normalizedConfig: PosOptionSelectionGroupConfig[],
  menuCode: string | undefined,
  t: (key: string) => string
): PosOptionSelectionGroupConfig[] {
  const withLabels = applyChickenOptionGroupLabelsToConfig(groups, normalizedConfig, menuCode, t)
  if (!isChickenMenu(menuCode)) return withLabels
  if (groups.length === 1 && groups[0] === "part") {
    return withLabels.map((row) => (row.key === "part" ? { ...row, label: t("posOptionGroupPart") || "부위" } : row))
  }
  if (!isSizePartGroups(groups)) return withLabels
  return withLabels.map((row) => {
    if (row.key !== "size") return row
    return {
      ...row,
      audience: "delivery",
      required: true,
      minSelect: 1,
      maxSelect: 1,
    }
  })
}

export function isChickenMenu(code: string | undefined): boolean {
  return !!code?.trim().toLowerCase().startsWith(CHICKEN_CODE_PREFIX)
}
/** 치킨 기본 옵션(S Boneless): 메뉴 관리 옵션 목록에서 제외하고, 기본 행 하나로만 표시 */
export function isChickenDefaultOption(name: string | undefined): boolean {
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

/** 옵션 구성 탭·메뉴 폼: 쉼표 구분 단계 키 (영문 키 권장: size, part, side, drink) */
export function parseOptionGroupsFromText(text: string): string[] {
  const parts = text
    .split(/[,，\n\r]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return Array.from(new Set(parts))
}

export function isSizePartGroups(groups: string[]): boolean {
  return groups.length === 2 && groups[0] === "size" && groups[1] === "part"
}

/** 위/아래 스왑 후 `normalizeOptionGroupsForMenu` 적용 결과. 경계 밖이면 null */
export function optionStepOrderAfterSwap(
  orderedKeys: string[],
  groupKey: string,
  direction: "up" | "down",
  menuCode: string | undefined
): string[] | null {
  const idx = orderedKeys.indexOf(groupKey)
  if (idx < 0) return null
  const target = direction === "up" ? idx - 1 : idx + 1
  if (target < 0 || target >= orderedKeys.length) return null
  const swapped = [...orderedKeys]
  const a = swapped[idx]!
  const b = swapped[target]!
  swapped[idx] = b
  swapped[target] = a
  return normalizeOptionGroupsForMenu(swapped, menuCode)
}

/** 치킨 옵션: DB option_step_values.size 가 비어 있을 때 이름 맨 앞 S/M/L 로 사이즈 추론 (레거시 행) */
export function inferChickenOptionSizeValue(o: PosMenuOption): string {
  const fromStep = String(o.optionStepValues?.size ?? "").trim()
  if (fromStep) return fromStep
  const name = String(o.name ?? "").trim()
  const m = name.match(/^\s*([SML])(?:\s*[-–—]\s*|\s+$|\b)/i)
  if (m) return m[1].toUpperCase()
  return ""
}

/** 치킨: DB part 비어 있을 때 `M - Boneless` 등에서 부위 토큰 추론 */
export function inferChickenOptionPartValue(o: PosMenuOption): string {
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
 * size/part 외 단계(sidedish 등)가 있으면, 이름만으로 part를 채우면 김치 같은 행이 part·다른 단계에 동시에 걸린다.
 * 레거시 콤보(M - 윙)·size 스텝이 있을 때만 이름에서 part 추론을 허용한다.
 */
export function shouldInferChickenPartFromName(o: PosMenuOption, stepGroups: string[]): boolean {
  if (isSizePartGroups(stepGroups)) return true
  if (stepGroups.length === 1 && stepGroups[0] === "part") return true
  if (stepGroups.length > 0 && stepGroups.every((k) => k === "size" || k === "part")) return true
  if (inferChickenOptionSizeValue(o)) return true
  if (/^\s*[SML](?:\s*[-–—]|\s+|\b)/i.test(String(o.name ?? "").trim())) return true
  return false
}

/** 옵션 구성 탭: 단계별 목록 필터(치킨 size/part는 이름에서 step 값 추론) */
export function optionStepValueForGroupFilter(
  opt: PosMenuOption,
  groupKey: string,
  menuCode: string | undefined,
  stepGroups: string[]
): string {
  if (isChickenMenu(menuCode) && isSizePartGroups(stepGroups)) {
    if (groupKey === "size") return inferChickenOptionSizeValue(opt)
    if (groupKey === "part") return inferChickenOptionPartValue(opt)
  }
  if (isChickenMenu(menuCode) && groupKey === "part" && stepGroups.includes("part")) {
    const direct = String(opt.optionStepValues?.part ?? "").trim()
    if (direct) return direct
    if (!shouldInferChickenPartFromName(opt, stepGroups)) return ""
    return inferChickenOptionPartValue(opt)
  }
  if (isChickenMenu(menuCode) && groupKey === "size" && stepGroups.includes("size")) {
    const direct = String(opt.optionStepValues?.size ?? "").trim()
    if (direct) return direct
    return inferChickenOptionSizeValue(opt)
  }
  return String(opt.optionStepValues?.[groupKey] ?? "").trim()
}

export function optionMatchesGroupFilter(
  opt: PosMenuOption,
  groupKey: string,
  menuCode: string | undefined,
  stepGroups: string[]
): boolean {
  return optionStepValueForGroupFilter(opt, groupKey, menuCode, stepGroups) !== ""
}

/** 치킨 옵션 구성: part 단계에서 부위 값별로 묶어 보여 줌 */
export function groupChickenMenuOptionsByPartValue(options: PosMenuOption[]): { partValue: string; items: PosMenuOption[] }[] {
  const map = new Map<string, PosMenuOption[]>()
  for (const o of options) {
    const p = inferChickenOptionPartValue(o)
    if (!p) continue
    if (!map.has(p)) map.set(p, [])
    map.get(p)!.push(o)
  }
  const entries = [...map.entries()]
  entries.sort((a, b) => {
    const ia = OPTION_PART_VALUES.indexOf(a[0] as (typeof OPTION_PART_VALUES)[number])
    const ib = OPTION_PART_VALUES.indexOf(b[0] as (typeof OPTION_PART_VALUES)[number])
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a[0].localeCompare(b[0], undefined, { numeric: true })
  })
  return entries.map(([partValue, items]) => ({
    partValue,
    items: [...items].sort((a, b) => {
      const ao = Number(a.sortOrder ?? 0)
      const bo = Number(b.sortOrder ?? 0)
      if (ao !== bo) return ao - bo
      return String(a.name ?? "").localeCompare(String(b.name ?? ""))
    }),
  }))
}

/** 치킨 옵션 구성: 관리자 목록에서 사이즈 단계일 때 S/M/L 값별로 묶어 보여 줌 */
export function groupChickenMenuOptionsBySizeValue(options: PosMenuOption[]): { sizeValue: string; items: PosMenuOption[] }[] {
  const map = new Map<string, PosMenuOption[]>()
  for (const o of options) {
    const sz = inferChickenOptionSizeValue(o)
    if (!sz) continue
    if (!map.has(sz)) map.set(sz, [])
    map.get(sz)!.push(o)
  }
  const entries = [...map.entries()]
  entries.sort((a, b) => {
    const ia = OPTION_SIZE_VALUES.indexOf(a[0] as "S" | "M" | "L")
    const ib = OPTION_SIZE_VALUES.indexOf(b[0] as "S" | "M" | "L")
    if (ia !== -1 && ib !== -1) return ia - ib
    if (ia !== -1) return -1
    if (ib !== -1) return 1
    return a[0].localeCompare(b[0], undefined, { numeric: true })
  })
  return entries.map(([sizeValue, items]) => ({
    sizeValue,
    items: [...items].sort((a, b) => {
      const ao = Number(a.sortOrder ?? 0)
      const bo = Number(b.sortOrder ?? 0)
      if (ao !== bo) return ao - bo
      return String(a.name ?? "").localeCompare(String(b.name ?? ""))
    }),
  }))
}

export function normalizeOptionSelectionConfig(
  groups: string[],
  existing?: PosOptionSelectionGroupConfig[]
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

/** 추가형 옵션: 연결 메뉴코드(또는 레거시 품목코드)×수량 */
export function additiveOptionLinkSuffix(opt: PosMenuOption, menus: PosMenu[]): string {
  if (opt.optionType !== "additive") return ""
  const mid = opt.additiveSourceMenuId
  if (mid != null && Number(mid) > 0) {
    const m = menus.find((x) => x.id === String(mid))
    return m ? `${m.code}×${opt.quantity ?? 1}` : `id:${mid}×${opt.quantity ?? 1}`
  }
  const ic = opt.itemCode?.trim()
  if (ic) return `${ic}×${opt.quantity ?? 1}`
  return ""
}

export function buildOptionCode(menuCode: string | undefined, sortOrder: number | undefined): string {
  const code = String(menuCode ?? "").trim()
  if (!code) return ""
  const order = Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : -1
  if (order < 0) return ""
  return `${code}-${Math.floor(order) + 1}`
}

export function resolveOptionCode(option: PosMenuOption, menuCode: string | undefined): string {
  const explicit = String(option.optionCode ?? "").trim()
  if (explicit) return explicit
  return buildOptionCode(menuCode, option.sortOrder)
}

export const emptyForm = {
  code: "",
  name: "",
  categoryMain: "",
  category: "",
  price: "",
  priceDelivery: "",
  imageUrl: "",
  descriptionDefault: "",
  descriptionDelivery: "",
  descriptionTable: "",
  vatIncluded: true,
  isActive: true,
  isBanban: false,
  banbanFlavorMenuIds: [] as string[],
  sellHall: true,
  sellDelivery: true,
  sellPackaging: true,
  sellMember: true,
}

export type PackagingChecklistDraftRow = {
  localId: string
  optionId: string
  orderType: PosPackagingChecklistOrderType
  itemName: string
  isRequired: boolean
  sortOrder: number
  isActive: boolean
}

export function newPackagingChecklistRow(sortOrder: number): PackagingChecklistDraftRow {
  return {
    localId: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    optionId: "",
    orderType: "both",
    itemName: "",
    isRequired: true,
    sortOrder,
    isActive: true,
  }
}
