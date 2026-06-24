"use client"

import * as React from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { PosMenu, PosMenuOption } from "@/lib/api-client"
import { PosChickenOptionPickerPanel } from "@/components/pos/pos-chicken-option-picker-panel"
import { resolvePosCartOptionDisplayName } from "@/lib/pos-cart-option-display-name"
import {
  packagingMenuBasePrice,
  packagingOptionPriceModifier,
} from "@/lib/member-portal-pickup-menu-filter"
import { shouldInitChickenTwoPhaseOnMenuOpen } from "@/lib/pos-chicken-option-picker-plan"
import type { ChickenTwoPhasePhase } from "@/lib/pos-chicken-option-picker-plan"
import { resolveChickenOptionPickerStepTitleSuffix } from "@/lib/pos-chicken-option-picker-plan"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import {
  inferOptionSelectionGroupsFromOptions,
  syncOptionSelectionConfigToGroupKeys,
} from "@/lib/pos-option-selection-groups"

type Props = {
  open: boolean
  menu: PosMenu | null
  options: PosMenuOption[]
  storeCode: string
  onClose: () => void
  onAdd: (menu: PosMenu, opt: PosMenuOption | null, defaultDisplay?: string) => void
  t: (key: MemberPortalKey, params?: Record<string, string>) => string
}

function posKeyT(t: Props["t"]) {
  return (key: string) => {
    const map: Record<string, MemberPortalKey> = {
      posOptionGroupSize: "orderOptionGroupSize",
      posOptionGroupPart: "orderOptionGroupPart",
      posBarBqPickSizeFirst: "orderPickSizeThenSide",
      posOptionDefault: "orderOptionDefault",
      optional: "orderOptional",
      skip: "orderSkip",
      posBack: "orderOptionBack",
      posBarBqBackToSize: "orderBackToSize",
      posOptionStepMismatchFallback: "orderOptionStepMismatchFallback",
      posAddWithoutOption: "orderAddWithoutOption",
    }
    const mp = map[key]
    return mp ? t(mp) : ""
  }
}

export function MemberPortalPickupOptionSheet({
  open,
  menu,
  options,
  storeCode,
  onClose,
  onAdd,
  t,
}: Props) {
  const [optionPickerStep, setOptionPickerStep] = React.useState(0)
  const [optionPickerSelections, setOptionPickerSelections] = React.useState<Record<string, string>>({})
  const [twoPhasePhase, setTwoPhasePhase] = React.useState<ChickenTwoPhasePhase>(null)
  const [pendingSizeOpt, setPendingSizeOpt] = React.useState<PosMenuOption | null>(null)

  const pickerMenu = React.useMemo(() => {
    if (!menu) return null
    const inferred = inferOptionSelectionGroupsFromOptions(options, menu.code)
    const configured = menu.optionSelectionGroups || []
    const groups =
      configured.length > 0
        ? configured
        : inferred.length > 0
          ? inferred
          : configured
    if (groups.length === 0 || groups.join("|") === configured.join("|")) return menu
    return {
      ...menu,
      optionSelectionGroups: groups,
      optionSelectionConfig: syncOptionSelectionConfigToGroupKeys(
        groups,
        menu.optionSelectionConfig
      ),
    }
  }, [menu, options])

  React.useEffect(() => {
    if (!open || !pickerMenu) return
    setOptionPickerStep(0)
    setOptionPickerSelections({})
    setPendingSizeOpt(null)
    if (shouldInitChickenTwoPhaseOnMenuOpen({ menu: pickerMenu, options, orderType: "takeout" })) {
      setTwoPhasePhase("size")
    } else {
      setTwoPhasePhase(null)
    }
  }, [open, pickerMenu, options])

  if (!open || !menu || !pickerMenu) return null

  const stepSuffix = resolveChickenOptionPickerStepTitleSuffix({
    menu: pickerMenu,
    orderType: "takeout",
    twoPhasePhase,
    optionPickerStep,
  })

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:px-5"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(88dvh,640px)] w-full max-w-md flex-col rounded-t-[28px] border border-white/10 bg-[#121214] shadow-2xl sm:max-h-[85vh] sm:rounded-[28px]"
        style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="font-semibold text-white">
              {menu.name}
              {stepSuffix ? <span className="text-white/50">{stepSuffix}</span> : null}
            </p>
            <p className="text-xs text-white/45">{t("orderSelectOption")}</p>
          </div>
          <button
            type="button"
            aria-label={t("orderBack")}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white/80"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <PosChickenOptionPickerPanel
            menu={pickerMenu}
            options={options}
            orderType="takeout"
            twoPhasePhase={twoPhasePhase}
            pendingSizeOpt={pendingSizeOpt}
            optionPickerStep={optionPickerStep}
            optionPickerSelections={optionPickerSelections}
            showMenuDescriptions={false}
            descriptionChannel="takeout"
            showDefaultButton
            storeCode={storeCode}
            getMenuPrice={packagingMenuBasePrice}
            getOptionModifier={packagingOptionPriceModifier}
            formatPrice={(n) => String(Math.round(n))}
            t={posKeyT(t)}
            translateChickenPartLabel={(name) => name}
            resolveCartDisplayName={(menu, opt) =>
              resolvePosCartOptionDisplayName(menu, opt, storeCode || undefined)
            }
            onAddToCart={(m, opt, defaultDisplay) => {
              onAdd(m, opt, defaultDisplay)
              onClose()
            }}
            setTwoPhasePhase={setTwoPhasePhase}
            setPendingSizeOpt={setPendingSizeOpt}
            setOptionPickerStep={setOptionPickerStep}
            setOptionPickerSelections={setOptionPickerSelections}
          />
        </div>

        <div
          className="shrink-0 border-t border-white/10 px-5 pt-3"
          style={{ paddingBottom: `max(1rem, env(safe-area-inset-bottom, 0px))` }}
        >
          <Button
            type="button"
            variant="outline"
            className="mb-1 w-full rounded-2xl border-2 border-white/55 bg-white/10 text-base font-semibold text-white hover:bg-white/15"
            onClick={onClose}
          >
            {t("orderCancelOption")}
          </Button>
        </div>
      </div>
    </div>
  )
}
