"use client"

import * as React from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
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
}

type OptionTemplateItem = {
  id: string
  label: string
  note?: string
}

type OptionGroupListPanelProps = {
  title: string
  emptyLabel: string
  requiredLabel: string
  optionalLabel: string
  groups: OptionGroupListItem[]
  selectedGroupKey: string
  onSelectGroup: (key: string) => void
  onChangeGroupLabel: (groupKey: string, label: string) => void
  moveUpLabel: string
  moveDownLabel: string
  onMoveGroup: (groupKey: string, direction: "up" | "down") => void
  hallLabel: string
  deliveryLabel: string
  onToggleGroupAudience: (groupKey: string, channel: "hall" | "delivery", checked: boolean) => void
  libraryTitle: string
  librarySearchLabel: string
  librarySearchPlaceholder: string
  librarySearchTerm: string
  onLibrarySearchTermChange: (value: string) => void
  filterAllLabel: string
  filterRecentLabel: string
  filterFrequentLabel: string
  filterDeliveryOnlyLabel: string
  libraryFilter: "all" | "recent" | "frequent" | "deliveryOnly"
  onLibraryFilterChange: (value: "all" | "recent" | "frequent" | "deliveryOnly") => void
  libraryItems: OptionTemplateItem[]
  libraryLoading: boolean
  libraryLoadingLabel: string
  libraryEmptyLabel: string
  useTemplateLabel: string
  onUseTemplate: (itemId: string) => void
}

export function OptionGroupListPanel({
  title,
  emptyLabel,
  requiredLabel,
  optionalLabel,
  groups,
  selectedGroupKey,
  onSelectGroup,
  onChangeGroupLabel,
  moveUpLabel,
  moveDownLabel,
  onMoveGroup,
  hallLabel,
  deliveryLabel,
  onToggleGroupAudience,
  libraryTitle,
  librarySearchLabel,
  librarySearchPlaceholder,
  librarySearchTerm,
  onLibrarySearchTermChange,
  filterAllLabel,
  filterRecentLabel,
  filterFrequentLabel,
  filterDeliveryOnlyLabel,
  libraryFilter,
  onLibraryFilterChange,
  libraryItems,
  libraryLoading,
  libraryLoadingLabel,
  libraryEmptyLabel,
  useTemplateLabel,
  onUseTemplate,
}: OptionGroupListPanelProps) {
  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="border-b bg-muted/20 px-4 py-3">
        <h3 className="text-sm font-bold">{title}</h3>
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
                  <button
                    type="button"
                    onClick={() => onSelectGroup(group.key)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                      selected
                        ? "border-primary/40 bg-primary/10"
                        : "border-transparent hover:border-border hover:bg-muted/40"
                    )}
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
                    <Input
                      className="mt-2 h-7 text-[11px]"
                      value={group.label}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => onChangeGroupLabel(group.key, e.target.value)}
                    />
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <label className="flex items-center gap-1">
                        <Checkbox
                          checked={group.audience !== "delivery"}
                          onCheckedChange={(v) => onToggleGroupAudience(group.key, "hall", v === true)}
                        />
                        {hallLabel}
                      </label>
                      <label className="flex items-center gap-1">
                        <Checkbox
                          checked={group.audience !== "hall"}
                          onCheckedChange={(v) => onToggleGroupAudience(group.key, "delivery", v === true)}
                        />
                        {deliveryLabel}
                      </label>
                    </div>
                    <div className="mt-2 flex items-center gap-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation()
                          onMoveGroup(group.key, "up")
                        }}
                      >
                        <ArrowUp className="mr-1 h-3 w-3" />
                        {moveUpLabel}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-[10px]"
                        onClick={(e) => {
                          e.stopPropagation()
                          onMoveGroup(group.key, "down")
                        }}
                      >
                        <ArrowDown className="mr-1 h-3 w-3" />
                        {moveDownLabel}
                      </Button>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        <div className="rounded-lg border bg-muted/10 p-2">
          <p className="text-xs font-semibold">{libraryTitle}</p>
          <div className="mt-2 space-y-2">
            <div>
              <p className="mb-1 text-[11px] text-muted-foreground">{librarySearchLabel}</p>
              <Input
                className="h-8 text-xs"
                placeholder={librarySearchPlaceholder}
                value={librarySearchTerm}
                onChange={(e) => onLibrarySearchTermChange(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              <Button
                type="button"
                size="sm"
                variant={libraryFilter === "all" ? "default" : "outline"}
                className="h-6 text-[10px]"
                onClick={() => onLibraryFilterChange("all")}
              >
                {filterAllLabel}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={libraryFilter === "recent" ? "default" : "outline"}
                className="h-6 text-[10px]"
                onClick={() => onLibraryFilterChange("recent")}
              >
                {filterRecentLabel}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={libraryFilter === "frequent" ? "default" : "outline"}
                className="h-6 text-[10px]"
                onClick={() => onLibraryFilterChange("frequent")}
              >
                {filterFrequentLabel}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={libraryFilter === "deliveryOnly" ? "default" : "outline"}
                className="h-6 text-[10px]"
                onClick={() => onLibraryFilterChange("deliveryOnly")}
              >
                {filterDeliveryOnlyLabel}
              </Button>
            </div>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded border bg-background p-1">
              {libraryLoading ? (
                <p className="p-2 text-[11px] text-muted-foreground">{libraryLoadingLabel}</p>
              ) : libraryItems.length === 0 ? (
                <p className="p-2 text-[11px] text-muted-foreground">{libraryEmptyLabel}</p>
              ) : (
                libraryItems.map((item) => (
                  <div key={item.id} className="rounded border p-1.5">
                    <p className="truncate text-xs font-medium">{item.label}</p>
                    {item.note ? <p className="mt-0.5 text-[10px] text-muted-foreground">{item.note}</p> : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-1 h-6 text-[10px]"
                      onClick={() => onUseTemplate(item.id)}
                    >
                      {useTemplateLabel}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
