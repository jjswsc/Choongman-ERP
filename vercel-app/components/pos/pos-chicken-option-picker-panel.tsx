"use client"

import * as React from "react"
import type { PosMenu, PosMenuOption } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import {
  resolvePosMenuOptionDescriptionForChannel,
  type PosDescriptionChannel,
} from "@/lib/pos-menu-display-description"
import {
  buildChickenTwoPhaseCartOption,
  computeChickenOptionRowPrice,
  resolveChickenMultistepMatch,
  resolveChickenOptionPickerPlan,
  type ChickenTwoPhasePhase,
} from "@/lib/pos-chicken-option-picker-plan"
import { isPosCartOptionLabelMatchPickerEnabled } from "@/lib/pos-cart-option-label-rollout"

export type PosChickenOptionPickerPanelProps = {
  menu: PosMenu
  options: PosMenuOption[]
  orderType: string
  twoPhasePhase: ChickenTwoPhasePhase
  pendingSizeOpt: PosMenuOption | null
  optionPickerStep: number
  optionPickerSelections: Record<string, string>
  showMenuDescriptions?: boolean
  descriptionChannel: PosDescriptionChannel
  /** 터미널: 항상, 주문 페이지: 배달만 */
  showDefaultButton: boolean
  storeCode?: string | null
  getMenuPrice: (menu: PosMenu) => number
  getOptionModifier: (opt: PosMenuOption) => number
  formatPrice: (amount: number) => string
  t: (key: string) => string
  translateChickenPartLabel: (name: string) => string
  resolveCartDisplayName: (menu: PosMenu, opt: PosMenuOption) => string
  onAddToCart: (menu: PosMenu, opt: PosMenuOption | null, defaultDisplay?: string) => void
  setTwoPhasePhase: (phase: ChickenTwoPhasePhase) => void
  setPendingSizeOpt: (opt: PosMenuOption | null) => void
  setOptionPickerStep: React.Dispatch<React.SetStateAction<number>>
  setOptionPickerSelections: React.Dispatch<React.SetStateAction<Record<string, string>>>
  /** 터미널 터치 디바운스 등 */
  wrapAction?: (fn: () => void) => void
}

function PosOptionPriceRow(props: {
  opt: PosMenuOption
  label: string
  priceText: string
  description?: string
  onClick: () => void
}) {
  const { opt, label, priceText, description, onClick } = props
  return (
    <button
      key={opt.id}
      type="button"
      onClick={onClick}
      className="flex justify-between gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-emerald-400 hover:bg-emerald-50"
    >
      <span className="min-w-0 flex-1 text-slate-800">
        <span className="block font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground" title={description}>
            {description}
          </span>
        ) : null}
      </span>
      <span className="shrink-0 font-bold text-emerald-600">{priceText}</span>
    </button>
  )
}

export function PosChickenOptionPickerPanel({
  menu,
  options,
  orderType,
  twoPhasePhase,
  pendingSizeOpt,
  optionPickerStep,
  optionPickerSelections,
  showMenuDescriptions,
  descriptionChannel,
  showDefaultButton,
  storeCode,
  getMenuPrice,
  getOptionModifier,
  formatPrice,
  t,
  translateChickenPartLabel,
  resolveCartDisplayName,
  onAddToCart,
  setTwoPhasePhase,
  setPendingSizeOpt,
  setOptionPickerStep,
  setOptionPickerSelections,
  wrapAction,
}: PosChickenOptionPickerPanelProps) {
  const act = wrapAction ?? ((fn: () => void) => fn())
  const pickerLabelRollout = isPosCartOptionLabelMatchPickerEnabled(storeCode)
  const plan = resolveChickenOptionPickerPlan({
    menu,
    options,
    orderType,
    twoPhasePhase,
    optionPickerStep,
    optionPickerSelections,
    t,
  })
  const menuBasePrice = getMenuPrice(menu)

  const optionDescription = (opt: PosMenuOption) =>
    showMenuDescriptions ? resolvePosMenuOptionDescriptionForChannel(opt, descriptionChannel) : ""

  const beginAncillaryPhase = (sizeOpt: PosMenuOption | null) => {
    setPendingSizeOpt(sizeOpt)
    setTwoPhasePhase("ancillary")
    setOptionPickerStep(0)
    setOptionPickerSelections({})
  }

  const completeTwoPhasePick = (ancillaryMatch: PosMenuOption | null) => {
    const merged = buildChickenTwoPhaseCartOption({
      menu,
      sizeOpt: pendingSizeOpt,
      ancillaryOpt: ancillaryMatch,
      allOptions: options,
      getOptionModifier,
      resolveCartDisplayName,
      storeCode,
    })
    if (merged) onAddToCart(menu, merged)
    else onAddToCart(menu, null, plan.chickenDefaultDisplay || undefined)
    setTwoPhasePhase(null)
    setPendingSizeOpt(null)
  }

  const defaultBtn =
    showDefaultButton && plan.isChickenMenu && plan.chickenDefaultDisplay ? (
      <button
        type="button"
        onClick={() =>
          act(() => {
            if (plan.inMSizePhase) {
              beginAncillaryPhase(null)
              return
            }
            onAddToCart(menu, null, plan.chickenDefaultDisplay)
          })
        }
        className="mb-3 flex w-full justify-between rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-left transition hover:border-amber-400 hover:bg-amber-100"
      >
        <span className="font-medium text-slate-800">
          {pickerLabelRollout
            ? plan.chickenDefaultDisplay
            : t("posOptionDefault") || "Default (S Boneless)"}
        </span>
        <span className="font-bold text-amber-600">{formatPrice(menuBasePrice)} ฿</span>
      </button>
    ) : null

  const renderMPriceRows = (opts: PosMenuOption[], onPick: (opt: PosMenuOption) => void) => (
    <div className="flex flex-col gap-2">
      {opts.map((opt) => (
        <PosOptionPriceRow
          key={opt.id}
          opt={opt}
          label={translateChickenPartLabel(opt.name)}
          priceText={`${formatPrice(menuBasePrice + getOptionModifier(opt))} ฿`}
          description={optionDescription(opt) || undefined}
          onClick={() => act(() => onPick(opt))}
        />
      ))}
    </div>
  )

  if (plan.mode === "two-phase-m-size") {
    return (
      <div className="flex flex-col gap-2 py-2">
        {defaultBtn}
        <p className="text-xs text-muted-foreground">
          {t("posBarBqPickSizeFirst") || "1. 사이즈(M) 선택 → 2. 사이드(치킨무·김치 등)"}
        </p>
        {renderMPriceRows(plan.flatMOpts, beginAncillaryPhase)}
      </div>
    )
  }

  if (plan.mode === "multistep" && plan.multistep) {
    const {
      groupKey,
      groupRequired,
      groupLabelText,
      showPartSideHint,
      stepValues,
      priceListRows,
      usePriceList,
    } = plan.multistep

    const finishMultistep = (selections: Record<string, string>) => {
      const match = resolveChickenMultistepMatch({ menu, plan, selections, storeCode })
      if (plan.useTwoPhase && twoPhasePhase === "ancillary") {
        completeTwoPhasePick(match)
      } else if (match) {
        onAddToCart(menu, match)
      } else {
        onAddToCart(menu, null)
      }
    }

    const handleStepSelect = (value: string) => {
      const next = { ...optionPickerSelections, [groupKey]: value }
      setOptionPickerSelections(next)
      if (optionPickerStep >= plan.activeStepGroups.length - 1) {
        finishMultistep(next)
      } else {
        setOptionPickerStep((s) => s + 1)
      }
    }

    const handleSkip = () => {
      const next = { ...optionPickerSelections }
      delete next[groupKey]
      setOptionPickerSelections(next)
      if (optionPickerStep >= plan.activeStepGroups.length - 1) {
        finishMultistep(next)
      } else {
        setOptionPickerStep((s) => s + 1)
      }
    }

    return (
      <div className="flex flex-col gap-3 py-2">
        {groupKey !== "sidedish" && groupKey !== "side" ? defaultBtn : null}
        {showPartSideHint ? (
          <p className="text-xs text-muted-foreground">
            {t("posBarBqPickSizeFirst") || "1. 사이즈(M) 선택 → 2. 사이드(치킨무·김치 등)"}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{groupLabelText}</p>
        )}
        {usePriceList ? (
          <div className="flex flex-col gap-2">
            {priceListRows.map(({ stepValue, option: opt }) => (
              <PosOptionPriceRow
                key={opt.id}
                opt={opt}
                label={translateChickenPartLabel(opt.name)}
                priceText={`${formatPrice(
                  computeChickenOptionRowPrice({
                    menu,
                    plan,
                    option: opt,
                    groupKey,
                    menuBasePrice,
                    pendingSelections: optionPickerSelections,
                    getOptionModifier,
                  })
                )} ฿`}
                description={optionDescription(opt) || undefined}
                onClick={() => act(() => handleStepSelect(stepValue))}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {stepValues.map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => act(() => handleStepSelect(val))}
                className="rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:border-emerald-400 hover:bg-emerald-50 text-slate-800"
              >
                {translateChickenPartLabel(val)}
              </button>
            ))}
          </div>
        )}
        {!groupRequired && (
          <Button variant="outline" size="sm" className="text-xs" onClick={() => act(handleSkip)}>
            {t("skip") || "건너뛰기"}
          </Button>
        )}
        {plan.useTwoPhase && twoPhasePhase === "ancillary" ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              setTwoPhasePhase("size")
              setOptionPickerStep(0)
              setOptionPickerSelections({})
            }}
          >
            ← {t("posBack") || "이전"} ({t("posBarBqBackToSize") || "사이즈"})
          </Button>
        ) : optionPickerStep > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => setOptionPickerStep((s) => s - 1)}
          >
            ← {t("posBack") || "이전"}
          </Button>
        ) : null}
      </div>
    )
  }

  if (plan.mode === "multistep-fallback") {
    if (Object.keys(optionPickerSelections).length > 0) {
      const match = resolveChickenMultistepMatch({
        menu,
        plan,
        selections: optionPickerSelections,
        storeCode,
      })
      if (match) {
        act(() => onAddToCart(menu, match))
        return null
      }
      if (plan.chickenDefaultDisplay) {
        act(() => onAddToCart(menu, null, plan.chickenDefaultDisplay))
        return null
      }
    }
    const fallbackOpts = plan.flatListOpts
    return (
      <div className="flex flex-col gap-2 py-2">
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t("posOptionStepMismatchFallback") ||
            "옵션 단계 설정이 맞지 않아 일반 옵션 목록으로 표시합니다."}
        </p>
        {defaultBtn}
        {fallbackOpts.length > 0 ? (
          renderMPriceRows(fallbackOpts, (opt) => onAddToCart(menu, opt))
        ) : (
          <Button variant="outline" onClick={() => act(() => onAddToCart(menu, null))}>
            {t("posAddWithoutOption") || "옵션 없이 담기"}
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 py-2">
      {defaultBtn}
      {renderMPriceRows(plan.flatListOpts, (opt) => onAddToCart(menu, opt))}
    </div>
  )
}
