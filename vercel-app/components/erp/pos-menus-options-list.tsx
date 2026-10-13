"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import {
  isChickenMenu,
  isChickenDefaultOption,
  isSizePartGroups,
  resolveOptionCode,
  groupChickenMenuOptionsBySizeValue,
  inferChickenOptionPartValue,
  groupChickenMenuOptionsByPartValue,
} from "@/app/admin/pos-menus/pos-menus-page-helpers"
import type { PosMenuOption, PosMenu } from "@/lib/api-client"
import { OptionItemRowCard } from "@/components/erp/option-item-row-card"

export interface PosMenuOptionsListSectionProps {
  t: (k: string) => string
  optionsConfigEffectiveGroupKey: string
  optionsConfigOptionListBracketLabel: string
  optionsConfigShowAllOptions: boolean
  setOptionsConfigShowAllOptions: React.Dispatch<React.SetStateAction<boolean>>
  optionsConfigOptionsOutsideSelectedGroupCount: number
  optionsConfigBulkValuesInput: string
  setOptionsConfigBulkValuesInput: React.Dispatch<React.SetStateAction<string>>
  optionsConfigBulkHallPrice: string
  setOptionsConfigBulkHallPrice: React.Dispatch<React.SetStateAction<string>>
  optionsConfigBulkDeliveryPrice: string
  setOptionsConfigBulkDeliveryPrice: React.Dispatch<React.SetStateAction<string>>
  optionsConfigSelectedMenuId: string | null
  setOptionsConfigBulkMenuPickerSearch: React.Dispatch<React.SetStateAction<string>>
  setOptionsConfigBulkMenuPickerChecked: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  setOptionsConfigBulkMenuPickerOpen: React.Dispatch<React.SetStateAction<boolean>>
  handleBulkAddValuesForSelectedGroup: () => Promise<void>
  optionsConfigSelectedMenu: PosMenu | null | undefined
  optionsConfigOptionsInSelectedGroup: PosMenuOption[]
  optionsConfigMenuOptions: PosMenuOption[]
  optionsConfigPanelStepGroups: string[]
  optionPartLabel: (name: string) => string
  handleOptionNameChangeForConfig: (opt: PosMenuOption, value: string) => void
  handlePriceChangeForConfig: (opt: PosMenuOption, field: "priceModifier" | "priceModifierDelivery" | "priceModifierPackaging", value: string) => void
  handleOptionChannelsChangeForConfig: (opt: PosMenuOption, patch: Partial<Pick<PosMenuOption, "sellHall" | "sellDelivery" | "sellPackaging">>) => void
  handleDeleteOptionForConfig: (opt: PosMenuOption) => Promise<void>
  optionsConfigSaving: boolean
  setOptionsConfigDraggingOptionId: React.Dispatch<React.SetStateAction<string | null>>
  optionsConfigDraggingOptionId: string | null
  handleOptionReorderForConfig: (dragId: string, dropId: string) => void
}

export function PosMenuOptionsListSection({
  t,
  optionsConfigEffectiveGroupKey,
  optionsConfigOptionListBracketLabel,
  optionsConfigShowAllOptions,
  setOptionsConfigShowAllOptions,
  optionsConfigOptionsOutsideSelectedGroupCount,
  optionsConfigBulkValuesInput,
  setOptionsConfigBulkValuesInput,
  optionsConfigBulkHallPrice,
  setOptionsConfigBulkHallPrice,
  optionsConfigBulkDeliveryPrice,
  setOptionsConfigBulkDeliveryPrice,
  optionsConfigSelectedMenuId,
  setOptionsConfigBulkMenuPickerSearch,
  setOptionsConfigBulkMenuPickerChecked,
  setOptionsConfigBulkMenuPickerOpen,
  handleBulkAddValuesForSelectedGroup,
  optionsConfigSelectedMenu,
  optionsConfigOptionsInSelectedGroup,
  optionsConfigMenuOptions,
  optionsConfigPanelStepGroups,
  optionPartLabel,
  handleOptionNameChangeForConfig,
  handlePriceChangeForConfig,
  handleOptionChannelsChangeForConfig,
  handleDeleteOptionForConfig,
  optionsConfigSaving,
  setOptionsConfigDraggingOptionId,
  optionsConfigDraggingOptionId,
  handleOptionReorderForConfig,
}: PosMenuOptionsListSectionProps) {
  return (
    <div className="rounded border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold">
          {t("posMenuOptions") || "옵션 목록"}{" "}
          {optionsConfigEffectiveGroupKey && optionsConfigEffectiveGroupKey !== "__default__"
            ? `(${optionsConfigOptionListBracketLabel})`
            : ""}
        </h4>
        <Button
          type="button"
          variant={optionsConfigShowAllOptions ? "default" : "outline"}
          size="sm"
          className={`${ADMIN_BTN_XS_CN} text-[11px]`}
          onClick={() => setOptionsConfigShowAllOptions((prev) => !prev)}
        >
          {optionsConfigShowAllOptions
            ? t("posOptionShowSelectedGroupOnly") || "선택 그룹만 보기"
            : t("posOptionShowAll") || "전체 보기"}
        </Button>
      </div>
      {!optionsConfigShowAllOptions &&
      optionsConfigEffectiveGroupKey &&
      optionsConfigEffectiveGroupKey !== "__default__" &&
      optionsConfigOptionsOutsideSelectedGroupCount > 0 ? (
        <p className="mb-2 text-[11px] text-muted-foreground">
          {(t("posOptionGroupHiddenCountHint") || "선택 그룹과 무관한 {n}개 옵션은 숨김 상태입니다.")
            .replace("{n}", String(optionsConfigOptionsOutsideSelectedGroupCount))}
        </p>
      ) : null}
      <div className="mb-2 rounded border bg-muted/10 p-2">
        <p className="mb-1 text-[11px] font-medium text-muted-foreground">
          {(t("posOptionBulkAddTitle") || "선택 그룹에 값 일괄 추가")} ({optionsConfigEffectiveGroupKey || "-"})
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            className="h-8 min-w-[240px] flex-1 text-xs"
            placeholder={t("posOptionBulkAddPlaceholder") || "예: 치킨무, 김치, 단무지"}
            value={optionsConfigBulkValuesInput}
            onChange={(e) => setOptionsConfigBulkValuesInput(e.target.value)}
          />
          <Input
            className="h-8 w-24 text-xs text-right"
            type="number"
            placeholder={t("posOptionBasePriceLabel") || "기본채널 가격"}
            value={optionsConfigBulkHallPrice}
            onChange={(e) => setOptionsConfigBulkHallPrice(e.target.value)}
          />
          <Input
            className="h-8 w-24 text-xs text-right"
            type="number"
            placeholder={t("posOptionDeliveryPriceLabel") || "배달 가격"}
            value={optionsConfigBulkDeliveryPrice}
            onChange={(e) => setOptionsConfigBulkDeliveryPrice(e.target.value)}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1 text-xs"
            disabled={!optionsConfigSelectedMenuId}
            onClick={() => {
              setOptionsConfigBulkMenuPickerSearch("")
              setOptionsConfigBulkMenuPickerChecked({})
              setOptionsConfigBulkMenuPickerOpen(true)
            }}
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
            {t("posOptionBulkMenuSearchBtn") || "메뉴 검색·선택"}
          </Button>
          <Button type="button" size="sm" className="h-8 text-xs" onClick={() => void handleBulkAddValuesForSelectedGroup()}>
            {t("posOptionBulkAddBtn") || "값 일괄 추가"}
          </Button>
        </div>
      </div>
      <div className="max-h-[520px] overflow-y-auto space-y-2 pr-1">
        {(() => {
          const optionsToShowRaw =
            optionsConfigSelectedMenu && isChickenMenu(optionsConfigSelectedMenu.code)
              ? optionsConfigOptionsInSelectedGroup.filter((o) => !isChickenDefaultOption(o.name))
              : optionsConfigOptionsInSelectedGroup
          const optionsToShowSource = optionsConfigShowAllOptions
            ? optionsConfigSelectedMenu && isChickenMenu(optionsConfigSelectedMenu.code)
              ? optionsConfigMenuOptions.filter((o) => !isChickenDefaultOption(o.name))
              : optionsConfigMenuOptions
            : optionsToShowRaw
          const optionsToShow = [...optionsToShowSource].sort((a, b) => {
            const ao = Number(a.sortOrder ?? 0)
            const bo = Number(b.sortOrder ?? 0)
            if (ao !== bo) return ao - bo
            return String(a.name ?? "").localeCompare(String(b.name ?? ""))
          })
          if (optionsToShow.length === 0) {
            return (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {optionsConfigMenuOptions.length === 0
                  ? (t("posOptionsConfigEmptyOptions") || "위에서 옵션을 추가해 주세요.")
                  : t("posOptionListFilteredEmpty")}
              </p>
            )
          }
          const chickenSizeStepGrouped =
            optionsConfigSelectedMenu &&
            isChickenMenu(optionsConfigSelectedMenu.code) &&
            isSizePartGroups(optionsConfigPanelStepGroups) &&
            optionsConfigEffectiveGroupKey === "size" &&
            !optionsConfigShowAllOptions

          const chickenPartStepGrouped =
            optionsConfigSelectedMenu &&
            isChickenMenu(optionsConfigSelectedMenu.code) &&
            isSizePartGroups(optionsConfigPanelStepGroups) &&
            optionsConfigEffectiveGroupKey === "part" &&
            !optionsConfigShowAllOptions

          const renderOptionCard = (o: PosMenuOption) => (
            <OptionItemRowCard
              key={o.id}
              option={o}
              displayCode={resolveOptionCode(o, optionsConfigSelectedMenu?.code)}
              displayName={optionPartLabel(o.name)}
              editableName={!!optionsConfigSelectedMenu}
              optionNamePlaceholder={t("posOptionNamePlaceholder") || "옵션명"}
              channelTitle={t("posOptionChannelTitle") || "판매 채널"}
              baseChannelLabel={t("posOptionBaseChannelLabel") || "기본채널(홀+포장)"}
              deliveryChannelLabel={t("posOptionSellDelivery") || "배달"}
              priceAdjustTitle={t("posOptionPriceAdjustTitle") || "가격 조정"}
              basePricePlaceholder={t("posOptionBasePricePlaceholder") || "기본채널"}
              deliveryPricePlaceholder={t("posOptionDeliveryPricePlaceholder") || "배달(미입력=기본)"}
              onChangeName={(value) => handleOptionNameChangeForConfig(o, value)}
              onChangePrice={(field, value) => handlePriceChangeForConfig(o, field, value)}
              onToggleBaseChannel={(checked) =>
                handleOptionChannelsChangeForConfig(o, {
                  sellHall: checked,
                  sellPackaging: checked,
                })
              }
              onToggleDeliveryChannel={(checked) =>
                handleOptionChannelsChangeForConfig(o, {
                  sellDelivery: checked,
                })
              }
              onDelete={() => void handleDeleteOptionForConfig(o)}
              deleteLabel={t("posOptionDeleteBtn") || "옵션 삭제"}
              deleteDisabled={optionsConfigSaving}
              draggable={true}
              onDragStart={() => setOptionsConfigDraggingOptionId(String(o.id))}
              onDragOver={() => undefined}
              onDrop={() => {
                if (!optionsConfigDraggingOptionId) return
                handleOptionReorderForConfig(optionsConfigDraggingOptionId, String(o.id))
                setOptionsConfigDraggingOptionId(null)
              }}
            />
          )

          if (chickenSizeStepGrouped) {
            const sections = groupChickenMenuOptionsBySizeValue(optionsToShow)
            if (sections.length === 0) {
              return <div className="space-y-2">{optionsToShow.map((o) => renderOptionCard(o))}</div>
            }
            return (
              <div className="space-y-4">
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {t("posOptionChickenSizeStepAdminHint")}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-dashed border-border/60 bg-muted/25 px-2 py-1.5">
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {t("posOptionChickenRegisteredSizes")}
                  </span>
                  {sections.map(({ sizeValue }) => (
                    <span
                      key={sizeValue}
                      className="rounded-full border border-primary/35 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-primary"
                    >
                      {sizeValue}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  사이즈 단계는 S/M/L만 선택합니다. 가격·채널 조합 편집은 [부위] 단계에서 진행해 주세요.
                </p>
                {sections.map(({ sizeValue, items }) => (
                  <div key={sizeValue} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-1.5">
                      <span className="text-[11px] font-semibold text-primary">
                        {t("posOptionGroupSize")}
                      </span>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums">
                        {sizeValue}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {(t("posOptionChickenSizeStepComboCount") || "{n}개 조합").replace(
                          "{n}",
                          String(items.length)
                        )}
                      </span>
                    </div>
                    <p className="px-0.5 text-[10px] leading-snug text-muted-foreground">
                      {(t("posOptionChickenSizeSectionSub") || "").replace("{size}", sizeValue)}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(
                        new Set(
                          items
                            .map((o) => inferChickenOptionPartValue(o))
                            .filter((x) => String(x).trim())
                            .map((x) => optionPartLabel(String(x)))
                        )
                      ).map((part) => (
                        <span
                          key={`${sizeValue}-${part}`}
                          className="rounded-md border border-border/80 bg-background px-2 py-0.5 text-[11px] text-foreground/90"
                        >
                          {part}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          }

          if (chickenPartStepGrouped) {
            const sections = groupChickenMenuOptionsByPartValue(optionsToShow)
            if (sections.length === 0) {
              return <div className="space-y-2">{optionsToShow.map((o) => renderOptionCard(o))}</div>
            }
            return (
              <div className="space-y-4">
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {t("posOptionChickenPartStepAdminHint")}
                </p>
                {sections.map(({ partValue, items }) => (
                  <div key={partValue} className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 border-b border-border/70 pb-1.5">
                      <span className="text-[11px] font-semibold text-primary">
                        {t("posOptionGroupPart")}
                      </span>
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold">
                        {optionPartLabel(partValue)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {(t("posOptionChickenSizeStepComboCount") || "{n}개 조합").replace(
                          "{n}",
                          String(items.length)
                        )}
                      </span>
                    </div>
                    <div className="space-y-2">{items.map((o) => renderOptionCard(o))}</div>
                  </div>
                ))}
              </div>
            )
          }

          return optionsToShow.map((o) => renderOptionCard(o))
        })()}
      </div>
    </div>
  )
}
