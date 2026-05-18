"use client"

import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import {
  normalizePosMenuImageUrl,
  shouldProxyPosMenuImageForHybrid,
  toHybridProxiedMenuImageHref,
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
    "absolute inset-0 flex h-full w-full items-center justify-center bg-slate-100 text-2xl text-slate-400"
  return (
    <div className={className ? `${base} ${className}` : base} aria-hidden>
      <span className="font-pos-emoji">🍗</span>
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
  if (!shouldProxyPosMenuImageForHybrid(href)) return href
  return toHybridProxiedMenuImageHref(href)
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
    const proxied =
      href &&
      httpsThumbnailProxy &&
      !skipProxy &&
      shouldProxyPosMenuImageForHybrid(href) &&
      displayHref !== href
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
