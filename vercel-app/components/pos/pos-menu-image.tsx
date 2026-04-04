/* eslint-disable @next/next/no-img-element -- 하이브리드(Electron/WebView)에서 외부 스토리지 URL은 네이티브 img가 더 안정적 */
"use client"

import { useMemo } from "react"

/**
 * Capacitor/WebView에서 HTTPS 페이지 + http 이미지가 혼합 콘텐츠로 막히는 경우가 있어 보정.
 * Supabase Storage 공개 URL은 https만 사용하는 것이 안전.
 */
export function normalizePosMenuImageUrl(raw: string): string {
  const u = String(raw ?? "").trim()
  if (!u) return ""
  if (u.startsWith("//")) return `https:${u}`
  /** 동일 출처 상대 경로 — Electron·웹 모두 현재 POS 오리진으로 절대화 */
  if (u.startsWith("/") && typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${u}`
  }
  if (u.startsWith("http://")) {
    const rest = u.slice("http://".length)
    const host = (rest.split("/")[0] ?? "").toLowerCase()
    if (host.endsWith(".supabase.co") || host === "supabase.co") {
      return `https://${rest}`
    }
  }
  return u
}

function isWindowsPosHybridShell(): boolean {
  if (typeof window === "undefined") return false
  const w = window as Window & { cmPosShell?: { printHtml?: unknown } }
  return typeof w.cmPosShell?.printHtml === "function"
}

type PosMenuFillImageProps = {
  src: string
  alt: string
  className?: string
}

/** 메뉴 타일용 — next/image 대신 img로 설치형·웹뷰에서 외부 스토리지 로딩 안정화 */
export function PosMenuFillImage({ src, alt, className = "" }: PosMenuFillImageProps) {
  const href = useMemo(() => normalizePosMenuImageUrl(src), [src])
  const hybrid = isWindowsPosHybridShell()
  if (!href) return null
  return (
    <img
      src={href}
      alt={alt}
      className={cnAbsoluteFill(className)}
      loading={hybrid ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer-when-downgrade"
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
