/* eslint-disable @next/next/no-img-element -- 하이브리드(Electron/WebView)에서 외부 스토리지 URL은 네이티브 img가 더 안정적 */
"use client"

import { useEffect, useMemo, useState } from "react"
import { isCmPosHybridShell } from "@/lib/cm-pos-shell"
import {
  fetchAndCacheMenuImage,
  getMenuImageBlobObjectUrl,
} from "@/lib/offline/pos-menu-images-cache"
import { normalizePosMenuImageUrl } from "@/lib/pos-menu-image-url"

export { normalizePosMenuImageUrl } from "@/lib/pos-menu-image-url"

type PosMenuFillImageProps = {
  src: string
  alt: string
  className?: string
}

/** 메뉴 타일용 — next/image 대신 img로 설치형·웹뷰에서 외부 스토리지 로딩 안정화 */
export function PosMenuFillImage({ src, alt, className = "" }: PosMenuFillImageProps) {
  const href = useMemo(() => normalizePosMenuImageUrl(src), [src])
  const hybrid = isCmPosHybridShell()
  const [blobSrc, setBlobSrc] = useState<string | null>(null)

  useEffect(() => {
    if (!hybrid || !href) {
      setBlobSrc(null)
      return
    }
    let cancelled = false
    const createdUrls: string[] = []
    ;(async () => {
      let u = await getMenuImageBlobObjectUrl(href)
      if (cancelled) {
        if (u) URL.revokeObjectURL(u)
        return
      }
      if (u) {
        createdUrls.push(u)
        setBlobSrc(u)
        return
      }
      setBlobSrc(null)
      await fetchAndCacheMenuImage(href)
      if (cancelled) return
      u = await getMenuImageBlobObjectUrl(href)
      if (cancelled) {
        if (u) URL.revokeObjectURL(u)
        return
      }
      if (u) {
        createdUrls.push(u)
        setBlobSrc(u)
      }
    })()
    return () => {
      cancelled = true
      for (const x of createdUrls) URL.revokeObjectURL(x)
    }
  }, [hybrid, href])

  if (!href) return null
  const imgSrc = hybrid ? blobSrc ?? href : href
  return (
    <img
      src={imgSrc}
      alt={alt}
      className={cnAbsoluteFill(className)}
      loading={hybrid ? "eager" : "lazy"}
      decoding="async"
      /** 교차 출처 스토리지가 Referer 정책으로 막는 경우 완화 */
      referrerPolicy="no-referrer"
      onError={(e) => {
        const t = e.target as HTMLImageElement
        if (t) t.style.display = "none"
      }}
    />
  )
}

function cnAbsoluteFill(extra: string) {
  const base = "absolute inset-0 h-full w-full object-cover"
  return extra ? `${base} ${extra}` : base
}
