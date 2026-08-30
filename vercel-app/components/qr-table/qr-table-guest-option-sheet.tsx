'use client'

import * as React from 'react'
import type { PosMenu, PosMenuOption } from '@/lib/api-client'
import { PosChickenOptionPickerPanel } from '@/components/pos/pos-chicken-option-picker-panel'
import { resolvePosCartOptionDisplayName } from '@/lib/pos-cart-option-display-name'
import {
  inferOptionSelectionGroupsFromOptions,
  syncOptionSelectionConfigToGroupKeys,
} from '@/lib/pos-option-selection-groups'
import {
  shouldInitChickenTwoPhaseOnMenuOpen,
  resolveChickenOptionPickerStepTitleSuffix,
  type ChickenTwoPhasePhase,
} from '@/lib/pos-chicken-option-picker-plan'
import {
  getBanbanFlavorMenuList,
  isBanbanFlavorWhitelistMissing,
  isBanbanMenu,
} from '@/lib/pos-banban-utils'
import { extractQrGuestOptionIds } from '@/lib/qr-table-guest-menu'
import { getBangkokTodayDateString } from '@/lib/bangkok-time'

export type QrGuestOptionPick = {
  optionIds: number[]
  optionName: string
  menuId1?: number
  menuId2?: number
  flavorName1?: string
  flavorName2?: string
}

type Props = {
  open: boolean
  menu: PosMenu | null
  options: PosMenuOption[]
  flavorMenus: PosMenu[]
  buffetIncluded: boolean
  storeCode: string
  t: (key: string) => string
  onClose: () => void
  onPick: (pick: QrGuestOptionPick) => void
}

export function QrTableGuestOptionSheet({
  open,
  menu,
  options,
  flavorMenus,
  buffetIncluded,
  storeCode,
  t,
  onClose,
  onPick,
}: Props) {
  const [optionPickerStep, setOptionPickerStep] = React.useState(0)
  const [optionPickerSelections, setOptionPickerSelections] = React.useState<Record<string, string>>({})
  const [twoPhasePhase, setTwoPhasePhase] = React.useState<ChickenTwoPhasePhase>(null)
  const [pendingSizeOpt, setPendingSizeOpt] = React.useState<PosMenuOption | null>(null)
  const [banbanFirst, setBanbanFirst] = React.useState<PosMenu | null>(null)

  const pickerMenu = React.useMemo(() => {
    if (!menu) return null
    const inferred = inferOptionSelectionGroupsFromOptions(options, menu.code)
    const configured = menu.optionSelectionGroups || []
    const groups = configured.length > 0 ? configured : inferred
    if (groups.length === 0 || groups.join('|') === configured.join('|')) return menu
    return {
      ...menu,
      optionSelectionGroups: groups,
      optionSelectionConfig: syncOptionSelectionConfigToGroupKeys(groups, menu.optionSelectionConfig),
    }
  }, [menu, options])

  React.useEffect(() => {
    if (!open || !pickerMenu) return
    setOptionPickerStep(0)
    setOptionPickerSelections({})
    setPendingSizeOpt(null)
    setBanbanFirst(null)
    if (shouldInitChickenTwoPhaseOnMenuOpen({ menu: pickerMenu, options, orderType: 'dine-in' })) {
      setTwoPhasePhase('size')
    } else {
      setTwoPhasePhase(null)
    }
  }, [open, pickerMenu, options])

  if (!open || !menu || !pickerMenu) return null

  const stepSuffix = resolveChickenOptionPickerStepTitleSuffix({
    menu: pickerMenu,
    orderType: 'dine-in',
    twoPhasePhase,
    optionPickerStep,
  })

  const todayStr = getBangkokTodayDateString()
  const banbanFlavors = isBanbanMenu(menu) ? getBanbanFlavorMenuList(flavorMenus, menu, todayStr) : []
  const flavorConfigMissing = isBanbanMenu(menu) && isBanbanFlavorWhitelistMissing(menu)

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/45"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[86dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex justify-center pt-2.5">
          <span className="h-1.5 w-10 rounded-full bg-stone-200" />
        </div>
        <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-1">
          <div className="min-w-0">
            <p className="text-base font-semibold">
              {menu.name}
              {stepSuffix ? <span className="text-stone-400">{stepSuffix}</span> : null}
            </p>
            <p className="text-xs text-stone-500">{t('selectOption')}</p>
          </div>
          <button
            type="button"
            className="rounded-full bg-stone-100 px-3 py-1.5 text-sm font-medium text-stone-700"
            onClick={onClose}
          >
            {t('close')}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {isBanbanMenu(menu) ? (
            <div className="space-y-3 py-1">
              <p className="text-sm text-stone-600">
                {banbanFirst ? t('banbanSecond') : t('banbanFirst')}
              </p>
              {banbanFirst ? (
                <p className="text-sm font-medium text-[var(--qr-brand,#b45309)]">
                  1. {banbanFirst.name}
                </p>
              ) : null}
              {banbanFlavors.length === 0 ? (
                <p className="text-sm text-stone-500">
                  {flavorConfigMissing ? t('banbanConfigNeeded') : t('banbanNoFlavor')}
                </p>
              ) : (
                <div className="grid gap-2">
                  {banbanFlavors.map((flavor) => (
                    <button
                      key={flavor.id}
                      type="button"
                      className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-left font-medium hover:border-[var(--qr-brand,#b45309)]"
                      onClick={() => {
                        if (!banbanFirst) {
                          setBanbanFirst(flavor)
                          return
                        }
                        onPick({
                          optionIds: [],
                          optionName: `${banbanFirst.name} / ${flavor.name}`,
                          menuId1: Number(banbanFirst.id),
                          menuId2: Number(flavor.id),
                          flavorName1: banbanFirst.name,
                          flavorName2: flavor.name,
                        })
                      }}
                    >
                      {flavor.name}
                    </button>
                  ))}
                </div>
              )}
              {banbanFirst ? (
                <button
                  type="button"
                  className="text-sm font-medium text-stone-600"
                  onClick={() => setBanbanFirst(null)}
                >
                  ← {t('optionBack')}
                </button>
              ) : null}
            </div>
          ) : (
            <PosChickenOptionPickerPanel
              menu={pickerMenu}
              options={options}
              orderType="dine-in"
              twoPhasePhase={twoPhasePhase}
              pendingSizeOpt={pendingSizeOpt}
              optionPickerStep={optionPickerStep}
              optionPickerSelections={optionPickerSelections}
              showMenuDescriptions={false}
              descriptionChannel="dine_in"
              showDefaultButton={false}
              storeCode={storeCode}
              getMenuPrice={(m) => (buffetIncluded ? 0 : Number(m.price) || 0)}
              getOptionModifier={(opt) => (buffetIncluded ? 0 : Number(opt.priceModifier) || 0)}
              formatPrice={(n) => `฿${Math.round(n).toLocaleString()}`}
              t={(key) => {
                const map: Record<string, string> = {
                  posOptionGroupSize: 'optionGroupSize',
                  posOptionGroupPart: 'optionGroupPart',
                  posOptionGroupTopping: 'optionGroupTopping',
                  posOptionGroupBone: 'optionGroupBone',
                  posOptionGroupType: 'optionGroupType',
                  posOptionGroupSide: 'optionGroupSide',
                  posOptionGroupDrink: 'optionGroupDrink',
                  posBarBqPickSizeFirst: 'pickSizeThenSide',
                  posOptionDefault: 'optionDefault',
                  optional: 'optional',
                  skip: 'skipOption',
                  posBack: 'optionBack',
                  posBarBqBackToSize: 'backToSize',
                  posOptionStepMismatchFallback: 'optionMismatch',
                  posAddWithoutOption: 'addWithoutOption',
                }
                return t(map[key] || key)
              }}
              translateChickenPartLabel={(name) => name}
              resolveCartDisplayName={(m, opt) => resolvePosCartOptionDisplayName(m, opt, storeCode || undefined)}
              onAddToCart={(_m, opt, defaultDisplay) => {
                const optionIds = extractQrGuestOptionIds(opt, pendingSizeOpt)
                const optionName =
                  (opt ? resolvePosCartOptionDisplayName(pickerMenu, opt, storeCode || undefined) : '') ||
                  defaultDisplay ||
                  ''
                if (options.some((o) => o.optionType !== 'additive') && optionIds.length === 0 && !defaultDisplay) {
                  return
                }
                onPick({ optionIds, optionName })
              }}
              setTwoPhasePhase={setTwoPhasePhase}
              setPendingSizeOpt={setPendingSizeOpt}
              setOptionPickerStep={setOptionPickerStep}
              setOptionPickerSelections={setOptionPickerSelections}
              tone="guest"
            />
          )}
        </div>
      </div>
    </div>
  )
}
