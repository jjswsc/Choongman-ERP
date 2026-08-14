"use client"

import * as React from "react"
import { GripVertical } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import type { PosMenuOption } from "@/lib/api-client"

type OptionItemRowCardProps = {
  option: PosMenuOption
  displayName: React.ReactNode
  displayCode?: string
  editableName?: boolean
  optionNamePlaceholder: string
  channelTitle: string
  baseChannelLabel: string
  deliveryChannelLabel: string
  priceAdjustTitle: string
  basePricePlaceholder: string
  deliveryPricePlaceholder: string
  onChangeName?: (value: string) => void
  onChangePrice: (field: "priceModifier" | "priceModifierDelivery", value: string) => void
  onToggleBaseChannel: (checked: boolean) => void
  onToggleDeliveryChannel: (checked: boolean) => void
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: () => void
  onDrop?: () => void
}

export function OptionItemRowCard({
  option,
  displayName,
  displayCode,
  editableName,
  optionNamePlaceholder,
  channelTitle,
  baseChannelLabel,
  deliveryChannelLabel,
  priceAdjustTitle,
  basePricePlaceholder,
  deliveryPricePlaceholder,
  onChangeName,
  onChangePrice,
  onToggleBaseChannel,
  onToggleDeliveryChannel,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
}: OptionItemRowCardProps) {
  const baseEnabled = (option.sellHall ?? true) || (option.sellPackaging ?? true)
  const deliveryEnabled = option.sellDelivery ?? true

  return (
    <div
      className="rounded-lg border bg-background p-3"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={(e) => {
        e.preventDefault()
        onDragOver?.()
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDrop?.()
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="shrink-0 cursor-grab text-muted-foreground active:cursor-grabbing"
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </span>
        {displayCode ? (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground tabular-nums">
            {displayCode}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {editableName ? (
            <Input
              value={String(option.name ?? "")}
              onChange={(e) => onChangeName?.(e.target.value)}
              placeholder={optionNamePlaceholder}
              className="h-8 text-xs"
            />
          ) : (
            <p className="truncate text-sm font-medium">{displayName}</p>
          )}
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded border p-2">
          <p className="mb-2 text-[11px] font-semibold text-muted-foreground">{channelTitle}</p>
          <div className="flex flex-wrap gap-3 text-xs">
            <label className="flex items-center gap-1.5">
              <Checkbox checked={baseEnabled} onCheckedChange={(v) => onToggleBaseChannel(v === true)} />
              {baseChannelLabel}
            </label>
            <label className="flex items-center gap-1.5">
              <Checkbox checked={deliveryEnabled} onCheckedChange={(v) => onToggleDeliveryChannel(v === true)} />
              {deliveryChannelLabel}
            </label>
          </div>
        </div>
        <div className="rounded border p-2">
          <p className="mb-2 text-[11px] font-semibold text-muted-foreground">{priceAdjustTitle}</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              className="h-8 text-right text-xs tabular-nums"
              placeholder={basePricePlaceholder}
              value={option.priceModifier ?? 0}
              onChange={(e) => onChangePrice("priceModifier", e.target.value)}
            />
            <Input
              type="number"
              className="h-8 text-right text-xs tabular-nums"
              placeholder={deliveryPricePlaceholder}
              value={option.priceModifierDelivery ?? ""}
              onChange={(e) => onChangePrice("priceModifierDelivery", e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
