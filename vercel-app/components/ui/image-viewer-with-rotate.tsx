"use client"

import * as React from "react"
import { RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react"
import { Button } from "./button"

/** 확대축소 3단계: 1x, 2x, 3x */
const ZOOM_LEVELS = [1, 2, 3] as const

export interface ImageViewerWithRotateProps {
  src: string
  alt?: string
  className?: string
  imgClassName?: string
  onError?: () => void
  onLoad?: () => void
  referrerPolicy?: React.ImgHTMLAttributes<HTMLImageElement>["referrerPolicy"]
  rotateLeftLabel?: string
  rotateRightLabel?: string
  zoomInLabel?: string
  zoomOutLabel?: string
}

/** 이미지 + 회전·확대축소 버튼. 사진 보기 모달 내부에서 사용 */
export function ImageViewerWithRotate({
  src,
  alt = "",
  className = "",
  imgClassName = "max-w-full max-h-[70vh] rounded-lg object-contain",
  onError,
  onLoad,
  referrerPolicy,
  rotateLeftLabel = "반시계",
  rotateRightLabel = "시계",
  zoomInLabel = "확대",
  zoomOutLabel = "축소",
}: ImageViewerWithRotateProps) {
  const [rotateDeg, setRotateDeg] = React.useState(0)
  const [zoomIdx, setZoomIdx] = React.useState(0)
  const scale = ZOOM_LEVELS[zoomIdx]

  const handleRotateLeft = () => setRotateDeg((d) => (d - 90) % 360)
  const handleRotateRight = () => setRotateDeg((d) => (d + 90) % 360)
  const handleZoomIn = () => setZoomIdx((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))
  const handleZoomOut = () => setZoomIdx((i) => Math.max(0, i - 1))

  return (
    <div className={`flex flex-col ${className || "relative"}`}>
      {/* 이미지 영역: 고정 높이 + overflow로 확대 시 스크롤만 되고 버튼은 항상 보임 */}
      <div className="flex min-h-[120px] max-h-[55vh] flex-1 items-center justify-center overflow-auto">
        <div style={{ zoom: scale }} className="inline-block">
          <img
            src={src}
            alt={alt}
            className={imgClassName}
            style={{ transform: `rotate(${rotateDeg}deg)` }}
            onError={onError}
            onLoad={onLoad}
            referrerPolicy={referrerPolicy}
          />
        </div>
      </div>
      <div className="mt-2 flex shrink-0 flex-wrap items-center justify-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleZoomOut}
          disabled={zoomIdx <= 0}
          className="h-8 gap-1 px-2 text-xs"
        >
          <ZoomOut className="h-3.5 w-3.5" />
          {zoomOutLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleZoomIn}
          disabled={zoomIdx >= ZOOM_LEVELS.length - 1}
          className="h-8 gap-1 px-2 text-xs"
        >
          <ZoomIn className="h-3.5 w-3.5" />
          {zoomInLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRotateLeft}
          className="h-8 gap-1 px-2 text-xs"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {rotateLeftLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRotateRight}
          className="h-8 gap-1 px-2 text-xs"
        >
          <RotateCw className="h-3.5 w-3.5" />
          {rotateRightLabel}
        </Button>
      </div>
    </div>
  )
}
