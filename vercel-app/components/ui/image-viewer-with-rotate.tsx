"use client"

import * as React from "react"
import { RotateCcw, RotateCw } from "lucide-react"
import { Button } from "./button"

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
}

/** 이미지 + 회전 버튼. 사진 보기 모달 내부에서 사용 */
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
}: ImageViewerWithRotateProps) {
  const [rotateDeg, setRotateDeg] = React.useState(0)

  const handleRotateLeft = () => setRotateDeg((d) => (d - 90) % 360)
  const handleRotateRight = () => setRotateDeg((d) => (d + 90) % 360)

  return (
    <div className={className || "relative"}>
      <div className="flex min-h-[120px] items-center justify-center overflow-auto">
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
      <div className="mt-2 flex items-center justify-center gap-1">
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
