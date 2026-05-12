"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type OptionGroupListItem = {
  key: string
  label: string
  required: boolean
  count: number
  audience: "all" | "hall" | "delivery"
  /** 단계 규칙 요약 (가운데 패널 조회 전용) */
  ruleSummary?: string
}

type OptionGroupListPanelProps = {
  title: string
  emptyLabel: string
  requiredLabel: string
  optionalLabel: string
  groups: OptionGroupListItem[]
  selectedGroupKey: string
  onSelectGroup: (key: string) => void
  /** false면 단계 이름·채널 편집 입력 표시 (레거시). true면 조회만 */
  stepListReadOnly?: boolean
  onChangeGroupLabel?: (groupKey: string, label: string) => void
  /** 생략하면 가운데 패널 상단에 [단계 저장] 미표시 — 우측 패널 등 다른 위치에서 저장 가능 */
  saveGroupsLabel?: string
  onSaveGroups?: () => void
  saveGroupsDisabled?: boolean
  /** 생략하면 치킨 프리셋 버튼 미표시 */
  chickenPresetLabel?: string
  onApplyChickenPreset?: () => void
  chickenPresetDisabled?: boolean
  moveUpLabel: string
  moveDownLabel: string
  onMoveGroup: (groupKey: string, direction: "up" | "down") => void
  /** 생략하면 단계 삭제 버튼 미표시 */
  removeGroupLabel?: string
  onRemoveGroup?: (groupKey: string) => void | Promise<void>
  removeGroupDisabled?: boolean
  hallLabel: string
  deliveryLabel: string
  onToggleGroupAudience?: (groupKey: string, channel: "hall" | "delivery", checked: boolean) => void
}

export function OptionGroupListPanel({
  title,
  emptyLabel,
  requiredLabel,
  optionalLabel,
  groups,
  selectedGroupKey,
  onSelectGroup,
  stepListReadOnly = false,
  onChangeGroupLabel,
  saveGroupsLabel,
  onSaveGroups,
  saveGroupsDisabled,
  chickenPresetLabel,
  onApplyChickenPreset,
  chickenPresetDisabled,
  moveUpLabel,
  moveDownLabel,
  onMoveGroup,
  removeGroupLabel,
  onRemoveGroup,
  removeGroupDisabled,
  hallLabel,
  deliveryLabel,
  onToggleGroupAudience,
}: OptionGroupListPanelProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="border-b bg-muted/20 px-4 py-3">
        <h3 className="text-sm font-bold">{title}</h3>
        {onSaveGroups || onApplyChickenPreset ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {onSaveGroups ? (
              <Button type="button" size="sm" className="h-7 text-[11px]" onClick={onSaveGroups} disabled={saveGroupsDisabled}>
                {saveGroupsLabel ?? ""}
              </Button>
            ) : null}
            {onApplyChickenPreset ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={onApplyChickenPreset}
                disabled={chickenPresetDisabled}
              >
                {chickenPresetLabel ?? ""}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="max-h-[560px] overflow-y-auto p-2 space-y-2">
        {groups.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="space-y-1">
            {groups.map((group) => {
              const selected = group.key === selectedGroupKey
              return (
                <li key={group.key}>
                  <div
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-xs transition-colors",
                      selected
                        ? "border-primary/40 bg-primary/10"
                        : "border-transparent hover:border-border hover:bg-muted/40"
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectGroup(group.key)}
                      className="w-full rounded-md text-left outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{group.label}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {group.count}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {group.required ? requiredLabel : optionalLabel}
                      </p>
                      {stepListReadOnly && group.ruleSummary ? (
                        <p className="mt-2 rounded-md bg-muted/30 px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
                          {group.ruleSummary}
                        </p>
                      ) : null}
                    </button>
                    {!stepListReadOnly ? (
                      <>
                        <Input
                          className="mt-2 h-7 text-[11px]"
                          value={group.label}
                          onChange={(e) => onChangeGroupLabel?.(group.key, e.target.value)}
                        />
                        <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                          <label className="flex items-center gap-1">
                            <Checkbox
                              checked={group.audience !== "delivery"}
                              onCheckedChange={(v) => onToggleGroupAudience?.(group.key, "hall", v === true)}
                            />
                            {hallLabel}
                          </label>
                          <label className="flex items-center gap-1">
                            <Checkbox
                              checked={group.audience !== "hall"}
                              onCheckedChange={(v) => onToggleGroupAudience?.(group.key, "delivery", v === true)}
                            />
                            {deliveryLabel}
                          </label>
                        </div>
                      </>
                    ) : null}
                    <div className="mt-2 flex flex-nowrap items-center gap-1 overflow-x-auto">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 shrink-0 whitespace-nowrap px-2 text-[10px]"
                        onClick={() => onMoveGroup(group.key, "up")}
                      >
                        <ArrowUp className="mr-1 h-3 w-3 shrink-0" />
                        {moveUpLabel}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 shrink-0 whitespace-nowrap px-2 text-[10px]"
                        onClick={() => onMoveGroup(group.key, "down")}
                      >
                        <ArrowDown className="mr-1 h-3 w-3 shrink-0" />
                        {moveDownLabel}
                      </Button>
                      {onRemoveGroup && group.key !== "__default__" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 shrink-0 whitespace-nowrap px-2 text-[10px] text-destructive hover:text-destructive"
                          disabled={removeGroupDisabled}
                          title={removeGroupLabel}
                          onClick={() => void onRemoveGroup(group.key)}
                        >
                          <Trash2 className="mr-1 h-3 w-3 shrink-0" />
                          {removeGroupLabel ?? ""}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
