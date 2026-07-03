"use client"

import * as React from "react"
import Cropper from "cropperjs"
import "cropperjs/dist/cropper.css"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  canvasToJpegFile,
  defaultDocumentCorners,
  detectDocumentCorners,
  getDocumentScanner,
  warpDocumentToCanvas,
  type DocumentCornerPoints,
} from "@/lib/document-scanner-client"

type ScanMode = "corners" | "crop"

type CornerKey = keyof DocumentCornerPoints

const CORNER_KEYS: CornerKey[] = [
  "topLeftCorner",
  "topRightCorner",
  "bottomRightCorner",
  "bottomLeftCorner",
]

type ImgLayout = {
  left: number
  top: number
  width: number
  height: number
}

export type ExpenseDocumentScanDialogProps = {
  open: boolean
  file: File | null
  onOpenChange: (open: boolean) => void
  /** 보정된 이미지 저장 */
  onConfirm: (file: File) => void
  /** 원본 그대로 첨부 */
  onUseOriginal: (file: File) => void
}

function cornerPolygonPoints(corners: DocumentCornerPoints, layout: ImgLayout, imgW: number, imgH: number) {
  const toDisplay = (p: { x: number; y: number }) => {
    const x = layout.left + (p.x / imgW) * layout.width
    const y = layout.top + (p.y / imgH) * layout.height
    return `${x},${y}`
  }
  return [
    toDisplay(corners.topLeftCorner),
    toDisplay(corners.topRightCorner),
    toDisplay(corners.bottomRightCorner),
    toDisplay(corners.bottomLeftCorner),
  ].join(" ")
}

export function ExpenseDocumentScanDialog({
  open,
  file,
  onOpenChange,
  onConfirm,
  onUseOriginal,
}: ExpenseDocumentScanDialogProps) {
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback(
    (key: string, fallback: string) => {
      const v = t(key)
      return !v || v === key ? fallback : v
    },
    [t]
  )

  const containerRef = React.useRef<HTMLDivElement>(null)
  const imageRef = React.useRef<HTMLImageElement>(null)
  const cropperRef = React.useRef<Cropper | null>(null)
  const dragKeyRef = React.useRef<CornerKey | null>(null)

  const [imageUrl, setImageUrl] = React.useState<string | null>(null)
  const [imgNatural, setImgNatural] = React.useState({ w: 0, h: 0 })
  const [imgLayout, setImgLayout] = React.useState<ImgLayout | null>(null)
  const [corners, setCorners] = React.useState<DocumentCornerPoints | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<ScanMode>("corners")
  const [engineLoading, setEngineLoading] = React.useState(false)
  const [processing, setProcessing] = React.useState(false)
  const [detecting, setDetecting] = React.useState(false)

  const measureLayout = React.useCallback(() => {
    const container = containerRef.current
    const img = imageRef.current
    if (!container || !img || !img.naturalWidth) return
    const cr = container.getBoundingClientRect()
    const ir = img.getBoundingClientRect()
    setImgLayout({
      left: ir.left - cr.left,
      top: ir.top - cr.top,
      width: ir.width,
      height: ir.height,
    })
  }, [])

  const refreshPreview = React.useCallback(
    async (cornerPoints: DocumentCornerPoints) => {
      const img = imageRef.current
      if (!img || !img.naturalWidth) return
      try {
        const canvas = await warpDocumentToCanvas(img, cornerPoints)
        if (!canvas) return
        const url = canvas.toDataURL("image/jpeg", 0.82)
        setPreviewUrl((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev)
          return url
        })
      } catch {
        // 미리보기 실패는 무시
      }
    },
    []
  )

  const runAutoDetect = React.useCallback(async () => {
    const img = imageRef.current
    if (!img || !img.naturalWidth) return
    setDetecting(true)
    try {
      await getDocumentScanner()
      const detected = await detectDocumentCorners(img)
      const next = detected ?? defaultDocumentCorners(img.naturalWidth, img.naturalHeight)
      setCorners(next)
      await refreshPreview(next)
    } finally {
      setDetecting(false)
    }
  }, [refreshPreview])

  React.useEffect(() => {
    if (!open || !file) {
      setImageUrl(null)
      setCorners(null)
      setPreviewUrl(null)
      setMode("corners")
      return
    }
    const url = URL.createObjectURL(file)
    setImageUrl(url)
    setEngineLoading(true)
    getDocumentScanner()
      .catch(() => undefined)
      .finally(() => setEngineLoading(false))
    return () => URL.revokeObjectURL(url)
  }, [open, file])

  React.useEffect(() => {
    if (!open) return
    const onResize = () => measureLayout()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [open, measureLayout])

  React.useEffect(() => {
    if (mode !== "crop" || !open || !imageRef.current) {
      cropperRef.current?.destroy()
      cropperRef.current = null
      return
    }
    const cropper = new Cropper(imageRef.current, {
      viewMode: 1,
      dragMode: "move",
      autoCropArea: 0.92,
      responsive: true,
      background: false,
    })
    cropperRef.current = cropper
    return () => {
      cropper.destroy()
      cropperRef.current = null
    }
  }, [mode, open, imageUrl])

  const displayToImage = React.useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const container = containerRef.current
      if (!container || !imgLayout || !imgNatural.w) return null
      const cr = container.getBoundingClientRect()
      const localX = clientX - cr.left - imgLayout.left
      const localY = clientY - cr.top - imgLayout.top
      const x = Math.max(0, Math.min(imgNatural.w, (localX / imgLayout.width) * imgNatural.w))
      const y = Math.max(0, Math.min(imgNatural.h, (localY / imgLayout.height) * imgNatural.h))
      return { x, y }
    },
    [imgLayout, imgNatural]
  )

  const onPointerDownCorner = (key: CornerKey) => (e: React.PointerEvent) => {
    e.preventDefault()
    dragKeyRef.current = key
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const key = dragKeyRef.current
    if (!key || !corners) return
    const pt = displayToImage(e.clientX, e.clientY)
    if (!pt) return
    setCorners((prev) => (prev ? { ...prev, [key]: pt } : prev))
  }

  const onPointerUp = () => {
    dragKeyRef.current = null
    setCorners((current) => {
      if (current) void refreshPreview(current)
      return current
    })
  }

  const handleApply = async () => {
    if (!file) return
    setProcessing(true)
    try {
      if (mode === "crop" && cropperRef.current) {
        const canvas = cropperRef.current.getCroppedCanvas({
          maxWidth: 1600,
          maxHeight: 1600,
          imageSmoothingQuality: "high",
        })
        if (!canvas) return
        const out = await canvasToJpegFile(canvas, file.name)
        onConfirm(out)
        return
      }
      const img = imageRef.current
      if (!img || !corners) return
      const canvas = await warpDocumentToCanvas(img, corners)
      if (!canvas) return
      const out = await canvasToJpegFile(canvas, file.name)
      onConfirm(out)
    } finally {
      setProcessing(false)
    }
  }

  const handleUseOriginal = () => {
    if (!file) return
    onUseOriginal(file)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tt("expenseDocScanTitle", "영수증 스캔 보정")}</DialogTitle>
          <DialogDescription>
            {tt(
              "expenseDocScanDesc",
              "영수증 가장자리를 맞춘 뒤 적용하세요. 자동 감지가 틀리면 꼭짓점을 드래그하거나 「직접 자르기」를 사용하세요."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant={mode === "corners" ? "default" : "outline"}
            onClick={() => setMode("corners")}
          >
            {tt("expenseDocScanModeCorners", "모서리 보정")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={mode === "crop" ? "default" : "outline"}
            onClick={() => setMode("crop")}
          >
            {tt("expenseDocScanModeCrop", "직접 자르기")}
          </Button>
          {mode === "corners" ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={detecting || engineLoading}
              onClick={() => void runAutoDetect()}
            >
              {detecting
                ? tt("expenseDocScanDetecting", "감지 중…")
                : tt("expenseDocScanAutoDetect", "자동 감지")}
            </Button>
          ) : null}
          {engineLoading ? (
            <span className="text-xs text-muted-foreground self-center">
              {tt("expenseDocScanLoading", "스캔 엔진 로딩…")}
            </span>
          ) : null}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div
            ref={containerRef}
            className="relative min-h-[220px] rounded-lg border bg-muted/20 flex items-center justify-center overflow-hidden"
            onPointerMove={mode === "corners" ? onPointerMove : undefined}
            onPointerUp={mode === "corners" ? onPointerUp : undefined}
            onPointerLeave={mode === "corners" ? onPointerUp : undefined}
          >
            {imageUrl ? (
              <img
                ref={imageRef}
                src={imageUrl}
                alt=""
                className={mode === "crop" ? "max-h-[50vh] max-w-full block" : "max-h-[50vh] max-w-full select-none"}
                draggable={false}
                onLoad={(e) => {
                  const img = e.currentTarget
                  setImgNatural({ w: img.naturalWidth, h: img.naturalHeight })
                  measureLayout()
                  const defaults = defaultDocumentCorners(img.naturalWidth, img.naturalHeight)
                  setCorners(defaults)
                  void (async () => {
                    setDetecting(true)
                    try {
                      await getDocumentScanner()
                      const detected = await detectDocumentCorners(img)
                      const next = detected ?? defaults
                      setCorners(next)
                      await refreshPreview(next)
                    } finally {
                      setDetecting(false)
                    }
                  })()
                }}
              />
            ) : null}

            {mode === "corners" && corners && imgLayout && imgNatural.w > 0 ? (
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <polygon
                  points={cornerPolygonPoints(corners, imgLayout, imgNatural.w, imgNatural.h)}
                  fill="rgba(59,130,246,0.12)"
                  stroke="rgb(59,130,246)"
                  strokeWidth={2}
                />
              </svg>
            ) : null}

            {mode === "corners" && corners && imgLayout && imgNatural.w > 0
              ? CORNER_KEYS.map((key) => {
                  const p = corners[key]
                  const left = imgLayout.left + (p.x / imgNatural.w) * imgLayout.width
                  const top = imgLayout.top + (p.y / imgNatural.h) * imgLayout.height
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={key}
                      className="absolute z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-background shadow pointer-events-auto touch-none"
                      style={{ left, top }}
                      onPointerDown={onPointerDownCorner(key)}
                    />
                  )
                })
              : null}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              {tt("expenseDocScanPreview", "미리보기")}
            </p>
            <div className="min-h-[220px] rounded-lg border bg-background flex items-center justify-center p-2">
              {previewUrl && mode === "corners" ? (
                <img src={previewUrl} alt="" className="max-h-[50vh] max-w-full object-contain" />
              ) : (
                <p className="text-xs text-muted-foreground px-4 text-center">
                  {mode === "crop"
                    ? tt("expenseDocScanCropHint", "드래그로 영역을 조정한 뒤 적용하세요.")
                    : tt("expenseDocScanPreviewEmpty", "모서리를 조정하면 보정 미리보기가 표시됩니다.")}
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={processing}>
            {tt("btnCancel", "취소")}
          </Button>
          <Button type="button" variant="secondary" onClick={handleUseOriginal} disabled={processing || !file}>
            {tt("expenseDocScanUseOriginal", "원본 사용")}
          </Button>
          <Button type="button" onClick={() => void handleApply()} disabled={processing || !file}>
            {processing ? tt("loading", "처리 중…") : tt("expenseDocScanApply", "보정 적용")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
