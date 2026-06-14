"use client"

import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import { UtensilsCrossed } from "lucide-react"
import {
  normalizePosMenuImageUrl,
  toPosMenuDisplayImageHref,
} from "@/lib/pos-menu-image-url"

export { normalizePosMenuImageUrl } from "@/lib/pos-menu-image-url"

type PosMenuFillImageProps = {
  src: string
  alt: string
  className?: string
  variant?: "tile" | "preview"
  previewErrorLabel?: string
}

function TilePlaceholder({ className = "" }: { className?: string }) {
  const base =
    "absolute inset-0 flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200/80"
  return (
    <div className={className ? `${base} ${className}` : base} aria-hidden>
      <UtensilsCrossed className="h-8 w-8 text-slate-400/70" strokeWidth={1.25} />
    </div>
  )
}

function cnAbsoluteFill(extra: string) {
  const base = "absolute inset-0 h-full w-full object-cover"
  return extra ? `${base} ${extra}` : base
}

function resolveDisplayHref(href: string, httpsThumbnailProxy: boolean, skipProxy: boolean): string {
  if (!href) return ""
  if (skipProxy || !httpsThumbnailProxy) return href
  return toPosMenuDisplayImageHref(href, { preferProxy: true })
}

/**
 * 메뉴 썸네일: https 환경에서는 Supabase URL을 동일 출처 프록시로 로드.
 * 프록시 실패 시 원본 URL로 1회 재시도한다.
 */
export function PosMenuFillImage({
  src,
  alt,
  className = "",
  variant = "tile",
  previewErrorLabel,
}: PosMenuFillImageProps) {
  const href = useMemo(() => normalizePosMenuImageUrl(src), [src])
  const [httpsThumbnailProxy, setHttpsThumbnailProxy] = useState(false)
  const [skipProxy, setSkipProxy] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)

  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    if (window.location.protocol !== "https:") return
    setHttpsThumbnailProxy(true)
  }, [])

  useEffect(() => {
    setSkipProxy(false)
    setLoadFailed(false)
  }, [href])

  const displayHref = useMemo(
    () => resolveDisplayHref(href, httpsThumbnailProxy, skipProxy),
    [href, httpsThumbnailProxy, skipProxy]
  )

  const handleImageError = () => {
    const proxied = href && httpsThumbnailProxy && !skipProxy && displayHref !== href
    if (proxied) {
      setSkipProxy(true)
      return
    }
    setLoadFailed(true)
  }

  if (variant === "preview") {
    if (!href) return null
    if (loadFailed) {
      return (
        <div
          className={
            className
              ? `absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] leading-tight text-muted-foreground ${className}`
              : "absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] leading-tight text-muted-foreground"
          }
        >
          {previewErrorLabel ?? "Unable to load"}
        </div>
      )
    }
    return (
      <img
        key={displayHref}
        src={displayHref}
        alt={alt}
        className={cnAbsoluteFill(className)}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={handleImageError}
      />
    )
  }

  if (!href) {
    return <TilePlaceholder className={className} />
  }

  if (loadFailed) {
    return <TilePlaceholder className={className} />
  }

  return (
    <img
      key={displayHref}
      src={displayHref}
      alt={alt}
      className={cnAbsoluteFill(className)}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={handleImageError}
    />
  )
}
