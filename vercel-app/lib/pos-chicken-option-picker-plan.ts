import type { PosMenu, PosMenuOption, PosOptionSelectionGroupConfig } from "@/lib/api-client"
import {
  filterFlatChickenMListOptions,
  isChickenDefaultOptionName,
  isChickenSizeOnlyOptionName,
  resolveChickenDefaultOptionDisplayName,
  shouldUseFlatChickenMOptionPicker,
  shouldUseChickenMultistepPriceList,
  collectChickenMultistepPriceListRows,
  computeChickenMultistepRowPrice,
  type ChickenMultistepPriceListRow,
} from "@/lib/pos-chicken-option-inference"
import {
  filterPosOptionsForBarBqFlatMList,
  getBarBqAncillarySelectionGroups,
  isBarBqChickenMenu,
  mergeBarBqSizeAndAncillaryForCart,
  pickBarBqSizePhaseOptions,
  shouldUseBarBqTwoPhaseOptionPicker,
  shouldUseFlatBarBqChickenOptionPicker,
} from "@/lib/pos-barbq-option-picker-ui"
import {
  collectPosOptionPickerStepValues,
  resolvePosOptionPickerMatch,
} from "@/lib/pos-option-picker-resolve"
import {
  filterOptionSelectionGroupsForAudience,
  filterPosOptionsForVisibleGroups,
  inferOptionSelectionGroupsFromOptions,
  resolveStepAudienceFromOrderType,
} from "@/lib/pos-option-selection-groups"

export type ChickenTwoPhasePhase = "size" | "ancillary" | null

export type ChickenOptionPickerViewMode =
  | "two-phase-m-size"
  | "multistep"
  | "multistep-fallback"
  | "flat-list"

export type ChickenOptionPickerPlan = {
  isChickenMenu: boolean
  useTwoPhase: boolean
  inMSizePhase: boolean
  mode: ChickenOptionPickerViewMode
  groups: string[]
  ancillaryGroups: string[]
  activeStepGroups: string[]
  opts: PosMenuOption[]
  optsToShow: PosMenuOption[]
  optsWithStepsToShow: PosMenuOption[]
  flatMOpts: PosMenuOption[]
  flatListOpts: PosMenuOption[]
  useFlatBarBqLegacy: boolean
  useFlatChickenMList: boolean
  chickenDefaultDisplay: string
  groupConfigMap: Map<string, PosOptionSelectionGroupConfig>
  multistep?: {
    groupKey: string
    groupRequired: boolean
    groupLabelText: string
    showPartSideHint: boolean
    stepValues: string[]
    priceListRows: ChickenMultistepPriceListRow[]
    usePriceList: boolean
  }
}

function isChickenMenu(menu: Pick<PosMenu, "categoryMain" | "code">): boolean {
  return (
    (menu.categoryMain ?? "") === "Chicken" ||
    menu.code?.trim().toLowerCase().startsWith("c") === true
  )
}

function hideChickenSizeOption(name: string | undefined): boolean {
  return isChickenSizeOnlyOptionName(name)
}

/** 메뉴 열릴 때 M→사이드 2단계 초기화 여부 (BBQ·동일 패턴) */
export function shouldInitChickenTwoPhaseOnMenuOpen(params: {
  menu: PosMenu
  options: PosMenuOption[]
  orderType: string
}): boolean {
  const cfg = new Map(
    (params.menu.optionSelectionConfig || [])
      .map((c) => [String(c?.key ?? "").trim(), c] as const)
      .filter(([k]) => !!k)
  )
  const aud = resolveStepAudienceFromOrderType(params.orderType)
  const groups = filterOptionSelectionGroupsForAudience(
    params.menu.optionSelectionGroups || [],
    cfg,
    aud
  )
  const ancillaryGroups = getBarBqAncillarySelectionGroups(groups)
  return shouldUseBarBqTwoPhaseOptionPicker({
    menu: params.menu,
    options: params.options,
    ancillaryGroups,
  })
}

/** 다이얼로그 제목 (1/2) 표시용 활성 단계 수 */
export function resolveChickenOptionPickerStepTitleSuffix(params: {
  menu: PosMenu
  orderType: string
  twoPhasePhase: ChickenTwoPhasePhase
  optionPickerStep: number
}): string {
  const cfg = new Map(
    (params.menu.optionSelectionConfig || [])
      .map((c) => [String(c?.key ?? "").trim(), c] as const)
      .filter(([k]) => !!k)
  )
  const aud = resolveStepAudienceFromOrderType(params.orderType)
  const allG = filterOptionSelectionGroupsForAudience(
    params.menu.optionSelectionGroups || [],
    cfg,
    aud
  )
  const stepG =
    params.twoPhasePhase === "ancillary" ? getBarBqAncillarySelectionGroups(allG) : allG
  return stepG.length ? ` (${(params.optionPickerStep || 0) + 1}/${stepG.length})` : ""
}

const GROUP_LABEL_KEYS: Record<string, string> = {
  size: "posOptionGroupSize",
  part: "posOptionGroupPart",
  topping: "posOptionGroupTopping",
  bone: "posOptionGroupBone",
  type: "posOptionGroupType",
  set_main: "posOptionGroupSetMain",
  side: "posOptionGroupSide",
  drink: "posOptionGroupDrink",
  soup: "posOptionGroupSoup",
  rice: "posOptionGroupRice",
}

const GROUP_LABEL_FALLBACK: Record<string, string> = {
  size: "사이즈",
  part: "부위",
  topping: "토핑",
  bone: "Bone / Boneless",
  type: "타입",
  set_main: "세트 메인",
  side: "사이드",
  drink: "음료",
  soup: "스프",
  rice: "밥",
}

export function resolveChickenOptionGroupLabel(
  groupKey: string,
  groupCfg: PosOptionSelectionGroupConfig | undefined,
  t: (key: string) => string
): string {
  const i18nKey = GROUP_LABEL_KEYS[groupKey]
  return (
    String(groupCfg?.label ?? "").trim() ||
    (i18nKey ? t(i18nKey) : "") ||
    GROUP_LABEL_FALLBACK[groupKey] ||
    groupKey
  )
}

export function resolveChickenOptionPickerPlan(params: {
  menu: PosMenu
  options: PosMenuOption[]
  orderType: string
  twoPhasePhase: ChickenTwoPhasePhase
  optionPickerStep: number
  optionPickerSelections: Record<string, string>
  t: (key: string) => string
  filterHiddenSizeOption?: (name: string | undefined) => boolean
}): ChickenOptionPickerPlan {
  const {
    menu,
    options: opts,
    orderType,
    twoPhasePhase,
    optionPickerStep,
    optionPickerSelections,
    t,
  } = params
  const isHiddenSize = params.filterHiddenSizeOption ?? hideChickenSizeOption
  const isChickenBase = isChickenMenu(menu)
  const groupConfigMap = new Map(
    (menu.optionSelectionConfig || [])
      .map((cfg) => [String(cfg?.key ?? "").trim(), cfg] as const)
      .filter(([k]) => !!k)
  )
  const stepAudience = resolveStepAudienceFromOrderType(orderType)
  const fallbackGroups = inferOptionSelectionGroupsFromOptions(opts, menu.code)
  const configuredGroups =
    (menu.optionSelectionGroups || []).length > 0 ? menu.optionSelectionGroups || [] : fallbackGroups
  const groups = filterOptionSelectionGroupsForAudience(configuredGroups, groupConfigMap, stepAudience)
  const ancillaryGroups = getBarBqAncillarySelectionGroups(groups)
  const useTwoPhase = shouldUseBarBqTwoPhaseOptionPicker({
    menu,
    options: opts,
    ancillaryGroups,
  })
  const inMSizePhase = useTwoPhase && twoPhasePhase !== "ancillary"
  const activeStepGroups =
    useTwoPhase && twoPhasePhase === "ancillary" ? ancillaryGroups : groups
  const visibleGroupKeys = new Set(activeStepGroups)
  const optsFilteredByGroup = filterPosOptionsForVisibleGroups(opts, visibleGroupKeys)
  const optsToShow = isChickenBase
    ? optsFilteredByGroup.filter((o) => !isHiddenSize(o.name))
    : optsFilteredByGroup
  const optsWithSteps = opts.filter(
    (o) =>
      o.optionType === "substitution" &&
      o.optionStepValues &&
      Object.keys(o.optionStepValues).length > 0
  )
  const optsWithStepsToShow = isChickenBase
    ? optsWithSteps.filter((o) => !isHiddenSize(o.name))
    : optsWithSteps
  const useFlatBarBqLegacy = shouldUseFlatBarBqChickenOptionPicker({ menu, options: opts })
  const useFlatChickenMList =
    isChickenBase &&
    shouldUseFlatChickenMOptionPicker({
      menuCode: menu.code,
      groups: activeStepGroups,
      options: opts,
      optionsWithSteps: optsWithStepsToShow,
    })
  const useMultiStep =
    activeStepGroups.length > 0 &&
    optsWithStepsToShow.length > 0 &&
    !useFlatBarBqLegacy &&
    !useFlatChickenMList &&
    !inMSizePhase
  const barBqFlatSource = pickBarBqSizePhaseOptions({
    useBarBqTwoPhase: useTwoPhase,
    phase: inMSizePhase ? "size" : twoPhasePhase,
    optionsRaw: (isChickenBase ? opts.filter((o) => !isHiddenSize(o.name)) : opts).filter(
      (o) => o.optionType === "substitution"
    ),
    optionsFiltered: optsToShow.filter((o) => o.optionType === "substitution"),
  })
  const flatBarBqOpts = isBarBqChickenMenu(menu)
    ? filterPosOptionsForBarBqFlatMList(barBqFlatSource)
    : optsToShow
  const flatChickenMOpts = useFlatChickenMList
    ? filterFlatChickenMListOptions(optsToShow.filter((o) => o.optionType === "substitution"))
    : optsToShow
  const flatMOpts = inMSizePhase ? flatBarBqOpts : flatChickenMOpts
  const flatListOpts = useFlatBarBqLegacy
    ? flatBarBqOpts
    : useFlatChickenMList
      ? flatChickenMOpts
      : optsToShow
  const chickenDefaultDisplay = resolveChickenDefaultOptionDisplayName(opts)

  let mode: ChickenOptionPickerViewMode = "flat-list"
  let multistep: ChickenOptionPickerPlan["multistep"]

  if (inMSizePhase) {
    mode = "two-phase-m-size"
  } else if (useMultiStep) {
    const groupKey = activeStepGroups[optionPickerStep]
    const groupCfg = groupConfigMap.get(groupKey)
    const groupRequired = groupCfg?.required !== false
    const stepValues = collectPosOptionPickerStepValues({
      groupKey,
      groups: activeStepGroups,
      menuCode: menu.code,
      options: opts,
      optionsWithSteps: optsWithStepsToShow,
      isChickenMenu: isChickenBase,
    })
    if (stepValues.length === 0) {
      mode = "multistep-fallback"
    } else {
      mode = "multistep"
      const priceListRows =
        isChickenBase && shouldUseChickenMultistepPriceList(isChickenBase, groupKey)
          ? collectChickenMultistepPriceListRows({
              groupKey,
              groups: activeStepGroups,
              menuCode: menu.code,
              options: opts,
              optionsWithSteps: optsWithStepsToShow,
            })
          : []
      const usePriceList = priceListRows.length > 0
      const showPartSideHint =
        usePriceList &&
        groupKey === "part" &&
        activeStepGroups.some((g) => g === "sidedish" || g === "side")
      const groupLabelText =
        resolveChickenOptionGroupLabel(groupKey, groupCfg, t) +
        (groupRequired ? "" : ` (${t("optional") || "선택"})`)
      multistep = {
        groupKey,
        groupRequired,
        groupLabelText,
        showPartSideHint,
        stepValues,
        priceListRows,
        usePriceList,
      }
    }
  }

  return {
    isChickenMenu: isChickenBase,
    useTwoPhase,
    inMSizePhase,
    mode,
    groups,
    ancillaryGroups,
    activeStepGroups,
    opts,
    optsToShow,
    optsWithStepsToShow,
    flatMOpts,
    flatListOpts,
    useFlatBarBqLegacy,
    useFlatChickenMList,
    chickenDefaultDisplay,
    groupConfigMap,
    multistep,
  }
}

/** 2단계(M→사이드) 완료 시 장바구니용 합성 옵션 */
export function buildChickenTwoPhaseCartOption(params: {
  menu: PosMenu
  sizeOpt: PosMenuOption | null
  ancillaryOpt: PosMenuOption | null
  allOptions: PosMenuOption[]
  getOptionModifier: (o: PosMenuOption) => number
  resolveCartDisplayName: (menu: PosMenu, opt: PosMenuOption) => string
}): PosMenuOption | null {
  const { menu, sizeOpt, ancillaryOpt, allOptions, getOptionModifier, resolveCartDisplayName } =
    params
  const hallMod =
    (sizeOpt ? getOptionModifier(sizeOpt) : 0) + (ancillaryOpt ? getOptionModifier(ancillaryOpt) : 0)
  const delMod =
    sizeOpt?.priceModifierDelivery != null || ancillaryOpt?.priceModifierDelivery != null
      ? (sizeOpt?.priceModifierDelivery != null
          ? Number(sizeOpt.priceModifierDelivery)
          : Number(sizeOpt?.priceModifier ?? 0)) +
        (ancillaryOpt?.priceModifierDelivery != null
          ? Number(ancillaryOpt.priceModifierDelivery)
          : ancillaryOpt
            ? Number(ancillaryOpt.priceModifier ?? 0)
            : 0)
      : null
  const merged = mergeBarBqSizeAndAncillaryForCart(sizeOpt, ancillaryOpt, {
    hallModifier: hallMod,
    deliveryModifier: delMod,
    sizeLabel: sizeOpt ? resolveCartDisplayName(menu, sizeOpt) : null,
    ancillaryLabel: ancillaryOpt ? resolveCartDisplayName(menu, ancillaryOpt) : null,
  })
  if (merged) return merged
  if (sizeOpt) return sizeOpt
  if (ancillaryOpt) return ancillaryOpt
  return null
}

export function resolveChickenMultistepMatch(params: {
  menu: PosMenu
  plan: ChickenOptionPickerPlan
  selections: Record<string, string>
}): PosMenuOption | null {
  const { menu, plan, selections } = params
  return resolvePosOptionPickerMatch({
    menuCode: menu.code,
    groups: plan.activeStepGroups,
    selections,
    optionsWithSteps: plan.optsWithStepsToShow,
    allOptions: plan.opts,
    groupConfigByKey: plan.groupConfigMap,
  })
}

export function computeChickenOptionRowPrice(params: {
  menu: PosMenu
  plan: ChickenOptionPickerPlan
  option: PosMenuOption
  groupKey: string
  menuBasePrice: number
  pendingSelections: Record<string, string>
  getOptionModifier: (o: PosMenuOption) => number
}): number {
  const { menu, plan, option, groupKey, menuBasePrice, pendingSelections, getOptionModifier } =
    params
  return computeChickenMultistepRowPrice({
    menuBasePrice,
    groupKey,
    option,
    groups: plan.activeStepGroups,
    menuCode: menu.code,
    pendingSelections,
    optionsWithSteps: plan.optsWithStepsToShow,
    getOptionModifier,
  })
}

export function isChickenSubstitutionOption(opt: PosMenuOption): boolean {
  return opt.optionType === "substitution" && !isChickenDefaultOptionName(opt.name)
}
