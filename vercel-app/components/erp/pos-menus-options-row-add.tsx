"use client"

import * as React from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select"
import {
  OPTION_SIZE_VALUES,
  OPTION_PART_VALUES,
  hasCustomGroupLabel,
  isChickenMenu,
  isSizePartGroups,
} from "@/app/admin/pos-menus/pos-menus-page-helpers"
import { Button } from "@/components/ui/button"
import { ADMIN_BTN_XS_CN } from "@/lib/admin-ui-standards"
import type { PosOptionSelectionGroupConfig, PosMenu } from "@/lib/api-client"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus } from "lucide-react"

export interface PosMenuOptionsRowAddSectionProps {
  t: (k: string) => string
  optionsConfigNewOptionTitle: string
  setOptionsConfigNewOptionTitle: React.Dispatch<React.SetStateAction<string>>
  optionsConfigUseSizePartUi: boolean
  newOptionSize: string
  setNewOptionSize: React.Dispatch<React.SetStateAction<string>>
  newOptionPart: string
  setNewOptionPart: React.Dispatch<React.SetStateAction<string>>
  optionsConfigPanelStepGroups: string[]
  optionsConfigEffectiveGroupKey: string
  optionsConfigGroupPanelItems: { key: string; label: string; required: boolean; count: number; audience: "all" | "hall" | "delivery"; minSelect: number; maxSelect: number; ruleSummary: string }[]
  optionsConfigNewStepValues: Record<string, string>
  setOptionsConfigNewStepValues: React.Dispatch<React.SetStateAction<Record<string, string>>>
  optionsConfigStepChannelScope: "all" | "hall" | "delivery"
  handleOptionsConfigStepChannelScope: (scope: "all" | "hall" | "delivery") => void
  optionsConfigSelectedMenuId: string | null
  optionsConfigGroupRulesDraft: PosOptionSelectionGroupConfig[]
  optionsConfigSelectedMenu: PosMenu | null | undefined
  handleOptionGroupRuleFieldChange: (groupKey: string, patch: Partial<PosOptionSelectionGroupConfig>) => void
  handleApplyOptionGroupsForConfig: () => Promise<void>
  optionsConfigApplyingGroups: boolean
  newOptionModifier: string
  setNewOptionModifier: React.Dispatch<React.SetStateAction<string>>
  newOptionModifierDelivery: string
  setNewOptionModifierDelivery: React.Dispatch<React.SetStateAction<string>>
  handleAddOptionForConfig: () => Promise<void>
  handleAddAllOptionsForConfig: () => Promise<void>
}

export function PosMenuOptionsRowAddSection({
  t,
  optionsConfigNewOptionTitle,
  setOptionsConfigNewOptionTitle,
  optionsConfigUseSizePartUi,
  newOptionSize,
  setNewOptionSize,
  newOptionPart,
  setNewOptionPart,
  optionsConfigPanelStepGroups,
  optionsConfigEffectiveGroupKey,
  optionsConfigGroupPanelItems,
  optionsConfigNewStepValues,
  setOptionsConfigNewStepValues,
  optionsConfigStepChannelScope,
  handleOptionsConfigStepChannelScope,
  optionsConfigSelectedMenuId,
  optionsConfigGroupRulesDraft,
  optionsConfigSelectedMenu,
  handleOptionGroupRuleFieldChange,
  handleApplyOptionGroupsForConfig,
  optionsConfigApplyingGroups,
  newOptionModifier,
  setNewOptionModifier,
  newOptionModifierDelivery,
  setNewOptionModifierDelivery,
  handleAddOptionForConfig,
  handleAddAllOptionsForConfig,
}: PosMenuOptionsRowAddSectionProps) {
  return (
    <div className="rounded border p-3 bg-muted/20">
      <p className="text-xs font-semibold">{t("posOptionRowAddBlockTitle")}</p>
      <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
        {t("posOptionRowAddBlockHint")}
      </p>
      <div className="mt-3 space-y-2">
        <div className="w-full">
          <label className="text-xs font-medium block mb-0.5">
            {t("posOptionTitle") || "선택지 줄 이름"}
          </label>
          <Input
            className="h-8 w-full text-xs"
            placeholder={t("posOptionNamePlaceholder") || "미입력 시 단계값으로 자동 생성"}
            value={optionsConfigNewOptionTitle}
            onChange={(e) => setOptionsConfigNewOptionTitle(e.target.value)}
          />
        </div>

        {optionsConfigUseSizePartUi ? (
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs font-medium block mb-0.5">1. {t("posOptionGroupSize")}</label>
              <Select value={newOptionSize || "_"} onValueChange={(v) => setNewOptionSize(v === "_" ? "" : v)}>
                <SelectTrigger className="h-8 w-20 text-xs">
                  <SelectValue placeholder={t("posOptionSizeAbbrevPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_">{t("posMenuCategoryAll") || "선택"}</SelectItem>
                  {OPTION_SIZE_VALUES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-0.5">2. {t("posOptionGroupPart")}</label>
              <div className="flex items-center gap-1">
                <Select value={newOptionPart || "_"} onValueChange={(v) => setNewOptionPart(v === "_" ? "" : v)}>
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue placeholder={t("posOptionPartPlaceholder") || "Boneless/Wing/Drumette"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">{t("posMenuCategoryAll") || "선택"}</SelectItem>
                    {OPTION_PART_VALUES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="h-8 w-28 text-xs"
                  value={newOptionPart}
                  onChange={(e) => setNewOptionPart(e.target.value)}
                  placeholder={t("posOptionPartCustomPlaceholder") || "Custom type"}
                />
              </div>
            </div>
          </div>
        ) : optionsConfigPanelStepGroups.length > 0 ? (
          <div className="flex flex-wrap gap-2 items-end w-full">
            {[...(optionsConfigPanelStepGroups || [])]
              .sort((a, b) => {
                if (a === optionsConfigEffectiveGroupKey) return -1
                if (b === optionsConfigEffectiveGroupKey) return 1
                return 0
              })
              .map((g) => {
                const stepFieldLabel =
                  optionsConfigGroupPanelItems.find((x) => x.key === g)?.label ?? g
                return (
              <div key={g}>
                <label className="text-xs font-medium block mb-0.5">
                  {stepFieldLabel}
                  {g === optionsConfigEffectiveGroupKey ? (
                    <span className="ml-1 text-[10px] text-primary">
                      {t("posOptionSelectedGroupBadge") || "편집 중"}
                    </span>
                  ) : null}
                </label>
                <Input
                  className="h-8 w-28 text-xs"
                  placeholder={g}
                  value={optionsConfigNewStepValues[g] ?? ""}
                  onChange={(e) => setOptionsConfigNewStepValues((p) => ({ ...p, [g]: e.target.value }))}
                />
              </div>
                )
              })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground py-1">
            {t("posOptionConfigNeedGroupsShort") || "먼저 위에서 선택 단계를 저장하세요."}
          </p>
        )}

        <div className="rounded border bg-background p-2">
          <p className="mb-1 text-[11px] font-semibold text-muted-foreground">
            {t("posOptionChannelScopeTitle") || "채널 설정 (기본채널=홀+포장, 배달)"}
          </p>
          {optionsConfigEffectiveGroupKey && optionsConfigEffectiveGroupKey !== "__default__" ? (
            <p className="mb-1.5 text-[10px] leading-snug text-muted-foreground">
              {t("posOptionChannelScopeStepHint") ||
                "선택 단계가 매장·포장/배달 중 어디에 보일지 정합니다. 변경 후 [단계 저장]을 눌러 주세요."}
            </p>
          ) : null}
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                variant={optionsConfigStepChannelScope === "all" ? "default" : "outline"}
                size="sm"
                className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                onClick={() => handleOptionsConfigStepChannelScope("all")}
              >
                {t("posOptionScopeAll") || "기본+배달"}
              </Button>
              <Button
                type="button"
                variant={optionsConfigStepChannelScope === "hall" ? "default" : "outline"}
                size="sm"
                className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                onClick={() => handleOptionsConfigStepChannelScope("hall")}
              >
                {t("posOptionScopeBaseOnly") || "기본채널만"}
              </Button>
              <Button
                type="button"
                variant={optionsConfigStepChannelScope === "delivery" ? "default" : "outline"}
                size="sm"
                className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                onClick={() => handleOptionsConfigStepChannelScope("delivery")}
              >
                {t("posOptionScopeDeliveryOnly") || "배달만"}
              </Button>
            </div>
            {optionsConfigSelectedMenuId &&
              optionsConfigPanelStepGroups.length > 0 &&
              optionsConfigEffectiveGroupKey &&
              optionsConfigEffectiveGroupKey !== "__default__" &&
              (() => {
                const groupKey = optionsConfigEffectiveGroupKey
                const row =
                  optionsConfigGroupRulesDraft.find((x) => x.key === groupKey) ||
                  ({
                    key: groupKey,
                    label: groupKey,
                    audience: "all",
                    required: true,
                    minSelect: 1,
                    maxSelect: 1,
                  } as PosOptionSelectionGroupConfig)
                const minSel =
                  row.minSelect != null && Number.isFinite(Number(row.minSelect))
                    ? Math.max(0, Math.floor(Number(row.minSelect)))
                    : row.required !== false
                      ? 1
                      : 0
                const maxSel =
                  row.maxSelect != null && Number.isFinite(Number(row.maxSelect))
                    ? Math.max(1, Math.floor(Number(row.maxSelect)))
                    : 1
                const promoLocked = !!optionsConfigSelectedMenu?.promoId?.trim()
                return (
                  <div className="flex w-full min-w-0 flex-col gap-2">
                    <div className="flex max-w-md items-start gap-2 rounded-md border border-border/50 bg-muted/15 px-2 py-1.5">
                      <Checkbox
                        id={`opt-req-${groupKey}`}
                        checked={row.required !== false}
                        disabled={promoLocked}
                        onCheckedChange={(ck) => {
                          const on = ck === true
                          handleOptionGroupRuleFieldChange(groupKey, {
                            required: on,
                            minSelect: on ? Math.max(1, minSel || 1) : 0,
                            maxSelect: on
                              ? Math.max(maxSel, Math.max(1, minSel || 1))
                              : Math.max(1, maxSel),
                          })
                        }}
                      />
                      <label
                        htmlFor={`opt-req-${groupKey}`}
                        className="cursor-pointer text-[11px] leading-snug"
                      >
                        <span className="font-medium">{t("posOptionRuleRequireForOrder")}</span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          {t("posOptionRuleRequireForOrderHint")}
                        </span>
                      </label>
                    </div>
                    <div className="flex max-w-md flex-col gap-0.5">
                      <label
                        htmlFor={`opt-grp-label-${groupKey}`}
                        className="text-[11px] font-medium text-muted-foreground"
                      >
                        {t("posOptionGroupDisplayName") || "그룹 표시명(배달)"}
                      </label>
                      <Input
                        id={`opt-grp-label-${groupKey}`}
                        type="text"
                        className="h-7 text-xs"
                        disabled={promoLocked}
                        placeholder={groupKey}
                        value={hasCustomGroupLabel(row as PosOptionSelectionGroupConfig, t) ? String(row.label ?? "") : ""}
                        onChange={(e) => {
                          handleOptionGroupRuleFieldChange(groupKey, {
                            label: e.target.value,
                          })
                        }}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {t("posOptionGroupDisplayNameHint") ||
                          "Grab 배달 화면의 옵션 그룹 제목으로 표시됩니다. 비우면 단계 키가 사용됩니다."}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="mb-0.5 block text-[11px] font-medium text-muted-foreground">
                          {t("posOptionRuleMinSelect")}
                        </label>
                        <Input
                          type="number"
                          min={0}
                          className="h-7 w-14 text-right text-xs"
                          disabled={promoLocked}
                          value={minSel}
                          onChange={(e) => {
                            const n = Math.max(0, Math.floor(Number(e.target.value)))
                            handleOptionGroupRuleFieldChange(groupKey, {
                              required: n > 0,
                              minSelect: n,
                              maxSelect: Math.max(maxSel, n > 0 ? n : 1),
                            })
                          }}
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[11px] font-medium text-muted-foreground">
                          {t("posOptionRuleMaxSelect")}
                        </label>
                        <Input
                          type="number"
                          min={1}
                          className="h-7 w-14 text-right text-xs"
                          disabled={promoLocked}
                          value={maxSel}
                          onChange={(e) => {
                            const n = Math.max(1, Math.floor(Number(e.target.value)))
                            handleOptionGroupRuleFieldChange(groupKey, {
                              maxSelect: n,
                              minSelect: Math.min(minSel, n),
                            })
                          }}
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className={`${ADMIN_BTN_XS_CN} text-[11px]`}
                        onClick={() => void handleApplyOptionGroupsForConfig()}
                        disabled={optionsConfigApplyingGroups || promoLocked}
                      >
                        {optionsConfigApplyingGroups
                          ? (t("saving") || "저장 중...")
                          : (t("posOptionConfigApplySteps") || "단계 저장")}
                      </Button>
                    </div>
                  </div>
                )
              })()}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex gap-2">
            <div>
              <div className="text-xs font-medium mb-0.5">
                {t("posOptionBasePriceLabel") || "기본채널 가격"}
              </div>
              <Input
                type="number"
                placeholder="0"
                className="h-8 w-28 text-right text-xs"
                value={newOptionModifier}
                onChange={(e) => setNewOptionModifier(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs font-medium mb-0.5">
                {t("posOptionDeliveryPriceLabel") || "배달 가격"}
              </div>
              <Input
                type="number"
                placeholder="-"
                className="h-8 w-24 text-right text-xs"
                value={newOptionModifierDelivery}
                onChange={(e) => setNewOptionModifierDelivery(e.target.value)}
              />
            </div>
            <div>
              <div className="text-xs font-medium mb-0.5 text-muted-foreground">
                {t("posOptionPackagingIncludedInBase") || "포장은 기본채널 가격에 포함"}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            className="h-8 px-3"
            onClick={handleAddOptionForConfig}
            disabled={
              optionsConfigUseSizePartUi
                ? !newOptionSize || !newOptionPart
                : optionsConfigPanelStepGroups.length === 0 ||
                  optionsConfigPanelStepGroups.some((g) => !(optionsConfigNewStepValues[g] ?? "").trim())
            }
            type="button"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t("posOptionAddSingle") || "옵션 추가"}
          </Button>
          {!optionsConfigSelectedMenu || !isChickenMenu(optionsConfigSelectedMenu.code) ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleAddAllOptionsForConfig}
              disabled={!optionsConfigSelectedMenu || !isSizePartGroups(optionsConfigPanelStepGroups)}
              title={
                !optionsConfigSelectedMenu || !isSizePartGroups(optionsConfigPanelStepGroups)
                  ? (t("posOptionConfigAddAllSizePartOnly") || "size, part 단계일 때만 사용")
                  : undefined
              }
            >
              {t("posOptionAddAll")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
