"use client"

import * as React from "react"
import { GripVertical, ImagePlus, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import type { PosMenuOption } from "@/lib/api-client"
import { normalizePosMenuImageUrl } from "@/lib/pos-menu-image-url"

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
  onDelete?: () => void
  deleteLabel?: string
  deleteDisabled?: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragOver?: () => void
  onDrop?: () => void
  /** 옵션 사진 */
  imageSectionTitle?: string
  imageUploadLabel?: string
  imageClearLabel?: string
  imagePickFromMenuLabel?: string
  imageUploading?: boolean
  onUploadImage?: (file: File) => void
  onClearImage?: () => void
  onPickImageFromMenu?: () => void
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
  onDelete,
  deleteLabel,
  deleteDisabled,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  imageSectionTitle,
  imageUploadLabel,
  imageClearLabel,
  imagePickFromMenuLabel,
  imageUploading,
  onUploadImage,
  onClearImage,
  onPickImageFromMenu,
}: OptionItemRowCardProps) {
  const baseEnabled = (option.sellHall ?? true) || (option.sellPackaging ?? true)
  const deliveryEnabled = option.sellDelivery ?? true
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const thumb = normalizePosMenuImageUrl(String(option.imageUrl ?? "").trim())
  const showImageControls = !!(onUploadImage || onClearImage || onPickImageFromMenu)

  return (
    <div
      className="rounded-lg border bg-background p-3"
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
          draggable={draggable}
          onDragStart={(e) => {
            e.stopPropagation()
            onDragStart?.()
          }}
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
        {onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={deleteDisabled}
            title={deleteLabel}
            aria-label={deleteLabel}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleteLabel ? <span className="text-[11px]">{deleteLabel}</span> : null}
          </Button>
        ) : null}
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

      {showImageControls ? (
        <div className="mt-3 rounded border p-2">
          <p className="mb-2 text-[11px] font-semibold text-muted-foreground">
            {imageSectionTitle || "Option photo"}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted/30">
              {thumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumb} alt="" className="h-full w-full object-cover" />
              ) : (
                <ImagePlus className="h-5 w-5 text-muted-foreground/70" aria-hidden />
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {onUploadImage ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      e.target.value = ""
                      if (file) onUploadImage(file)
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={imageUploading || deleteDisabled}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {imageUploading
                      ? "…"
                      : imageUploadLabel || "Upload"}
                  </Button>
                </>
              ) : null}
              {onPickImageFromMenu ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-[11px]"
                  disabled={imageUploading || deleteDisabled}
                  onClick={() => onPickImageFromMenu()}
                >
                  {imagePickFromMenuLabel || "From menu"}
                </Button>
              ) : null}
              {onClearImage && thumb ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
                  disabled={imageUploading || deleteDisabled}
                  onClick={() => onClearImage()}
                >
                  <X className="h-3.5 w-3.5" />
                  {imageClearLabel || "Clear"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
