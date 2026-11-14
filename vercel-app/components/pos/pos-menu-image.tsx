"use client"

import { useEffect, useMemo, useState } from "react"
import { UtensilsCrossed } from "lucide-react"
import {
  normalizePosMenuImageUrl,
  toPosMenuDisplayImageHref,
  toSupabaseStorageRenderHref,
} from "@/lib/pos-menu-image-url"
import {
  fetchAndCacheMenuImage,
  getMenuImageBlobObjectUrl,
} from "@/lib/offline/pos-menu-images-cache"

export { normalizePosMenuImageUrl } from "@/lib/pos-menu-image-url"

type PosMenuFillImageProps = {
  src: string
  alt: string
  className?: string
  variant?: "tile" | "preview"
  previewErrorLabel?: string
}

type LoadStage = "direct" | "original" | "proxy"

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

function hrefForStage(href: string, stage: LoadStage): string {
  if (!href) return ""
  if (stage === "proxy") return toPosMenuDisplayImageHref(href, { preferProxy: true })
  if (stage === "original") return href
  return toSupabaseStorageRenderHref(href) || href
}

/**
 * 메뉴 썸네일: 공개 Storage는 Vercel을 거치지 않고 로드.
 * IndexedDB 히트 시 blob 재사용(Cached Egress 절감).
 * 미스 시 transform → 원본 URL → 동일 출처 프록시 순으로 1회씩만 재시도한다.
 */
export function PosMenuFillImage({
  src,
  alt,
  className = "",
  variant = "tile",
  previewErrorLabel,
}: PosMenuFillImageProps) {
  const href = useMemo(() => normalizePosMenuImageUrl(src), [src])
  const [stage, setStage] = useState<LoadStage>("direct")
  const [loadFailed, setLoadFailed] = useState(false)
  const [blobSrc, setBlobSrc] = useState<string | null>(null)

  useEffect(() => {
    setStage("direct")
    setLoadFailed(false)
    setBlobSrc(null)
    if (!href) return

    let cancelled = false
    let objectUrl: string | null = null
    void (async () => {
      const blob = await getMenuImageBlobObjectUrl(href)
      if (cancelled) {
        if (blob) URL.revokeObjectURL(blob)
        return
      }
      if (blob) {
        objectUrl = blob
        setBlobSrc(blob)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [href])

  const displayHref = useMemo(() => {
    if (blobSrc) return blobSrc
    return hrefForStage(href, stage)
  }, [blobSrc, href, stage])

  const handleImageError = () => {
    if (blobSrc) {
      URL.revokeObjectURL(blobSrc)
      setBlobSrc(null)
      return
    }
    const originalHref = hrefForStage(href, "original")
    const proxyHref = hrefForStage(href, "proxy")
    if (stage === "direct" && originalHref && originalHref !== displayHref) {
      setStage("original")
      return
    }
    if (stage !== "proxy" && proxyHref && proxyHref !== displayHref) {
      setStage("proxy")
      return
    }
    setLoadFailed(true)
  }

  const handleImageLoad = () => {
    if (!href || blobSrc) return
    // 동일 출처 프록시로 1회 IDB 적재 → 이후 새로고침은 Supabase Cached Egress 회피
    void fetchAndCacheMenuImage(href)
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
        onLoad={handleImageLoad}
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
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={handleImageError}
      onLoad={handleImageLoad}
    />
  )
}
