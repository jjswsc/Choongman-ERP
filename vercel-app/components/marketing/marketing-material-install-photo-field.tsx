"use client"

import * as React from "react"
import { ImageIcon, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ImageViewerWithRotate } from "@/components/ui/image-viewer-with-rotate"

type InstallPhotoFieldProps = {
  label: string
  hint?: string
  optionalLabel?: string
  previewUrl?: string | null
  onPickFile: (file: File | null) => void
  disabled?: boolean
  className?: string
}

export function MarketingMaterialInstallPhotoField({
  label,
  hint,
  optionalLabel,
  previewUrl,
  onPickFile,
  disabled = false,
  className,
}: InstallPhotoFieldProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [localPreview, setLocalPreview] = React.useState<string | null>(null)

  React.useEffect(() => {
    return () => {
      if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview)
    }
  }, [localPreview])

  const displayUrl = localPreview || (previewUrl?.trim() ? previewUrl.trim() : null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview)
    if (!file) {
      setLocalPreview(null)
      onPickFile(null)
      return
    }
    const url = URL.createObjectURL(file)
    setLocalPreview(url)
    onPickFile(file)
    e.target.value = ""
  }

  const clear = () => {
    if (localPreview?.startsWith("blob:")) URL.revokeObjectURL(localPreview)
    setLocalPreview(null)
    onPickFile(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-medium text-foreground">{label}</label>
        {optionalLabel ? (
          <span className="text-[10px] text-muted-foreground">({optionalLabel})</span>
        ) : null}
      </div>
      {hint ? <p className="text-[10px] text-muted-foreground">{hint}</p> : null}
      <div className="flex flex-wrap items-start gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          disabled={disabled}
          onChange={handleChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9 gap-1.5"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <ImageIcon className="h-4 w-4" />
          {label}
        </Button>
        {displayUrl ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={displayUrl}
              alt=""
              className="h-16 w-16 rounded-md border object-cover"
            />
            {!disabled ? (
              <button
                type="button"
                className="absolute -right-1 -top-1 rounded-full border bg-background p-0.5 shadow"
                onClick={clear}
                aria-label="remove"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

type InstallPhotoThumbProps = {
  url: string
  title?: string
  className?: string
}

export function MarketingMaterialInstallPhotoThumb({
  url,
  title,
  className,
}: InstallPhotoThumbProps) {
  const [open, setOpen] = React.useState(false)
  const src = String(url || "").trim()
  if (!src) return null

  return (
    <>
      <button
        type="button"
        className={cn("block overflow-hidden rounded-md border", className)}
        onClick={() => setOpen(true)}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="h-14 w-14 object-cover" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title || "Install photo"}</DialogTitle>
          </DialogHeader>
          <ImageViewerWithRotate src={src} alt={title || "install"} className="max-h-[70vh]" />
        </DialogContent>
      </Dialog>
    </>
  )
}
