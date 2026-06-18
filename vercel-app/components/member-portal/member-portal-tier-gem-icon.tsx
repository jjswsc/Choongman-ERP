"use client"

import * as React from "react"
import type { TierFamily } from "@/lib/member-portal-tier-visual"
import { tierGemAssetUrl } from "@/lib/member-portal-tier-gem-assets"
import type { MemberPortalTierGemRenderMode } from "@/lib/member-portal-tier-gem-render"
import { useMemberPortalTierGemRenderMode } from "@/components/member-portal/member-portal-tier-gem-render-context"
import { cn } from "@/lib/utils"

type TierFacetedGemIconProps = {
  family: TierFamily
  size?: number
  className?: string
  /** 카드 우측 상단 — choongman_member_home_only.html .card-gem */
  variant?: "default" | "cardHero"
  /** 미지정 시 URL `?gem=photo|svg` 또는 기본 svg */
  renderMode?: MemberPortalTierGemRenderMode
  /** true면 실사 WebP 로드 실패 시 SVG로 대체하지 않음 (관리자 비교용) */
  suppressPhotoFallback?: boolean
  onPhotoLoadState?: (state: "loading" | "loaded" | "error") => void
}

type GemPalette = {
  top: string
  left: string
  right: string
  bottom: string
  edge: string
}

/** 원본 시안(💎) — 등급별 색만 다르고 단순 플랫 보석 */
const GEM_PALETTES: Record<TierFamily, GemPalette> = {
  bronze: { top: "#f5d5a8", left: "#cd7f32", right: "#e8a862", bottom: "#8b5a2b", edge: "#6b4423" },
  silver: { top: "#f8fafc", left: "#94a3b8", right: "#cbd5e1", bottom: "#64748b", edge: "#475569" },
  gold: { top: "#fef3c7", left: "#f59e0b", right: "#fcd34d", bottom: "#b45309", edge: "#92400e" },
  platinum: { top: "#f0f9ff", left: "#7dd3fc", right: "#bae6fd", bottom: "#475569", edge: "#334155" },
  diamond: { top: "#ede9fe", left: "#8b5cf6", right: "#c4b5fd", bottom: "#5b21b6", edge: "#4c1d95" },
  vip: { top: "#ffe4e6", left: "#f43f5e", right: "#fda4af", bottom: "#be123c", edge: "#9f1239" },
  default: { top: "#fef3c7", left: "#d97706", right: "#fbbf24", bottom: "#92400e", edge: "#78350f" },
}

function TierFacetedGemSvg({
  family,
  size,
  className,
  variant,
}: Omit<TierFacetedGemIconProps, "renderMode">) {
  const uid = React.useId().replace(/:/g, "")
  const p = GEM_PALETTES[family] || GEM_PALETTES.default
  const id = (name: string) => `tier-gem-${uid}-${name}`

  const shadowClass =
    variant === "cardHero"
      ? "drop-shadow-[0_8px_10px_rgba(255,255,255,0.18)]"
      : "drop-shadow-[0_4px_8px_rgba(0,0,0,0.22)]"

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={cn("shrink-0", shadowClass, className)}
      aria-hidden
    >
      <defs>
        <linearGradient id={id("top")} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={p.top} />
          <stop offset="100%" stopColor={p.right} />
        </linearGradient>
        <linearGradient id={id("left")} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={p.left} />
          <stop offset="100%" stopColor={p.bottom} />
        </linearGradient>
        <linearGradient id={id("right")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={p.right} />
          <stop offset="100%" stopColor={p.left} />
        </linearGradient>
        <linearGradient id={id("bottom")} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={p.left} />
          <stop offset="100%" stopColor={p.bottom} />
        </linearGradient>
      </defs>

      <polygon points="32,6 14,28 32,34 50,28" fill={`url(#${id("top")})`} />
      <polygon points="14,28 32,34 32,58 14,28" fill={`url(#${id("left")})`} />
      <polygon points="50,28 32,34 32,58 50,28" fill={`url(#${id("right")})`} />
      <polygon points="32,34 22,58 32,58 42,58" fill={`url(#${id("bottom")})`} />
      <polygon
        points="32,6 14,28 32,58 50,28"
        fill="none"
        stroke={p.edge}
        strokeWidth="0.8"
        strokeLinejoin="round"
        opacity="0.35"
      />
      <polygon points="32,10 24,24 32,28 40,24" fill="white" opacity="0.45" />
      <circle cx="26" cy="18" r="2" fill="white" opacity="0.7" />
    </svg>
  )
}

function TierPhotoGemImage({
  family,
  size,
  className,
  variant,
  onFallback,
  onPhotoLoadState,
}: Omit<TierFacetedGemIconProps, "renderMode" | "suppressPhotoFallback"> & {
  onFallback: () => void
}) {
  const shadowClass =
    variant === "cardHero"
      ? "drop-shadow-[0_8px_10px_rgba(255,255,255,0.18)]"
      : "drop-shadow-[0_4px_8px_rgba(0,0,0,0.22)]"

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tierGemAssetUrl(family)}
      alt=""
      width={size}
      height={size}
      className={cn(
        "shrink-0 object-contain",
        shadowClass,
        variant === "cardHero" ? "mix-blend-screen" : "",
        className
      )}
      onLoad={() => onPhotoLoadState?.("loaded")}
      onError={() => {
        onPhotoLoadState?.("error")
        onFallback()
      }}
    />
  )
}

/**
 * choongman_member_home_only.html .card-gem 스타일
 * — 기본: 투명 SVG. `?gem=photo` 또는 renderMode="photo" 시 WebP 실사 젬.
 */
export function TierFacetedGemIcon({
  family,
  size = 48,
  className,
  variant = "default",
  renderMode: renderModeProp,
  suppressPhotoFallback = false,
  onPhotoLoadState,
}: TierFacetedGemIconProps) {
  const contextMode = useMemberPortalTierGemRenderMode()
  const renderMode = renderModeProp ?? contextMode
  const [photoFailed, setPhotoFailed] = React.useState(false)

  React.useEffect(() => {
    setPhotoFailed(false)
    if (renderMode === "photo") onPhotoLoadState?.("loading")
  }, [family, renderMode, onPhotoLoadState])

  if (renderMode === "photo" && (!photoFailed || suppressPhotoFallback)) {
    if (photoFailed && suppressPhotoFallback) {
      return (
        <span
          className={cn(
            "inline-flex shrink-0 items-center justify-center rounded border border-dashed border-rose-300 bg-rose-50 text-[9px] font-semibold text-rose-600",
            className
          )}
          style={{ width: size, height: size }}
        >
          404
        </span>
      )
    }

    return (
      <TierPhotoGemImage
        family={family}
        size={size}
        className={className}
        variant={variant}
        onPhotoLoadState={onPhotoLoadState}
        onFallback={() => setPhotoFailed(true)}
      />
    )
  }

  return <TierFacetedGemSvg family={family} size={size} className={className} variant={variant} />
}
