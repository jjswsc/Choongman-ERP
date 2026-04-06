/* eslint-disable @next/next/no-img-element -- POS 메뉴 썸네일은 네이티브 img가 가장 단순·안정적 */
"use client"

import { useEffect, useLayoutEffect, useMemo, useState } from "react"
import {
  normalizePosMenuImageUrl,
  shouldProxyPosMenuImageForHybrid,
  toHybridProxiedMenuImageHref,
} from "@/lib/pos-menu-image-url"

export { normalizePosMenuImageUrl } from "@/lib/pos-menu-image-url"

// #region agent log
let dbgTileRenderN = 0
let dbgTileLoadN = 0
let dbgTileErrN = 0
function dbgIngestTile(
  hypothesisId: string,
  location: string,
  message: string,
  data: Record<string, unknown>
) {
  if (typeof window === "undefined") return
  fetch("http://127.0.0.1:7510/ingest/f85ce2e6-3f30-4dec-a500-2fe4222a00ab", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "d9674e",
    },
    body: JSON.stringify({
      sessionId: "d9674e",
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {})
}
// #endregion

function safeNum(v: number | undefined): number {
  return Number.isFinite(v) ? Number(v) : -1
}

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

/**
 * 메뉴 썸네일: `http`(로컬 등)은 Supabase 직접 로드.
 * **`https`(웹 PWA·Vercel·하이브리드 공통)** 는 SW/교차 출처 이슈를 피하려고 `/api/posMenuImageProxy`로 동일 출처 로드.
 */
export function PosMenuFillImage({
  src,
  alt,
  className = "",
  variant = "tile",
  previewErrorLabel,
}: PosMenuFillImageProps) {
  const href = useMemo(() => normalizePosMenuImageUrl(src), [src])
  /** SSR·첫 클라이언트 렌더 일치 후, https에서만 프록시 URL로 전환 */
  const [httpsThumbnailProxy, setHttpsThumbnailProxy] = useState(false)
  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    if (window.location.protocol !== "https:") return
    setHttpsThumbnailProxy(true)
  }, [])

  const displayHref = useMemo(() => {
    if (!href) return ""
    if (!httpsThumbnailProxy) return href
    if (!shouldProxyPosMenuImageForHybrid(href)) return href
    return toHybridProxiedMenuImageHref(href)
  }, [href, httpsThumbnailProxy])

  const [loadFailed, setLoadFailed] = useState(false)

  useEffect(() => {
    setLoadFailed(false)
  }, [displayHref])

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
        onError={() => setLoadFailed(true)}
      />
    )
  }

  if (!href) {
    // #region agent log
    if (variant === "tile" && src.trim() && typeof window !== "undefined") {
      dbgIngestTile("H-EMPTY", "pos-menu-image.tsx:no-href", "raw src but normalize empty", {
        rawLen: src.length,
        rawPrefix: src.slice(0, 80),
      })
    }
    // #endregion
    return <TilePlaceholder className={className} />
  }

  if (loadFailed) {
    return <TilePlaceholder className={className} />
  }

  // #region agent log
  if (variant === "tile" && typeof window !== "undefined") {
    dbgTileRenderN++
    if (dbgTileRenderN <= 16) {
      dbgIngestTile("H-REND", "pos-menu-image.tsx:tile-render", "tile img render", {
        n: dbgTileRenderN,
        rawLen: src.length,
        hrefLen: href.length,
        dispLen: displayHref.length,
        dispIsProxy: displayHref.startsWith("/api/posMenuImageProxy"),
        pageProto: window.location.protocol,
        proxyFlag: httpsThumbnailProxy,
      })
    }
  }
  // #endregion

  return (
    <img
      key={displayHref}
      src={displayHref}
      alt={alt}
      className={cnAbsoluteFill(className)}
      loading="eager"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={(ev) => {
        if (variant !== "tile") return
        dbgTileLoadN++
        if (dbgTileLoadN <= 16) {
          const im = ev.currentTarget
          const r = im.getBoundingClientRect()
          const parent = im.parentElement
          const pr = parent?.getBoundingClientRect()
          const card = im.closest("[data-menu-card]")
          const cr = card?.getBoundingClientRect()
          const style = window.getComputedStyle(im)
          dbgIngestTile("H-LOAD", "pos-menu-image.tsx:tile-onLoad", "menu img loaded", {
            n: dbgTileLoadN,
            nw: im.naturalWidth,
            nh: im.naturalHeight,
            ow: im.offsetWidth,
            oh: im.offsetHeight,
            rw: Math.round(r.width),
            rh: Math.round(r.height),
            pw: Math.round(safeNum(pr?.width)),
            ph: Math.round(safeNum(pr?.height)),
            cw: Math.round(safeNum(cr?.width)),
            ch: Math.round(safeNum(cr?.height)),
            path: window.location.pathname,
            imgDisplay: style.display,
            imgVisibility: style.visibility,
            imgOpacity: style.opacity,
            dispIsProxy: displayHref.startsWith("/api/posMenuImageProxy"),
            complete: im.complete,
          })
        }
      }}
      onError={() => {
        if (variant === "tile") {
          dbgTileErrN++
          if (dbgTileErrN <= 8) {
            dbgIngestTile("H-ERR", "pos-menu-image.tsx:tile-onError", "menu img error", {
              n: dbgTileErrN,
              dispPrefix: displayHref.slice(0, 100),
            })
          }
        }
        setLoadFailed(true)
      }}
    />
  )
}

function cnAbsoluteFill(extra: string) {
  const base = "absolute inset-0 h-full w-full object-cover"
  return extra ? `${base} ${extra}` : base
}
