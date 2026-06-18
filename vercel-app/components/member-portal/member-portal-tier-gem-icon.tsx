"use client"

import * as React from "react"
import type { TierFamily } from "@/lib/member-portal-tier-visual"
import { cn } from "@/lib/utils"

type TierFacetedGemIconProps = {
  family: TierFamily
  size?: number
  className?: string
  /** 카드 우측 상단 — choongman_member_home_only.html .card-gem */
  variant?: "default" | "cardHero"
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

/**
 * choongman_member_home_only.html .card-gem 스타일
 * — 투명 SVG, 실사 PNG 없음, 💎 이모지와 같은 단순 입체감
 */
export function TierFacetedGemIcon({
  family,
  size = 48,
  className,
  variant = "default",
}: TierFacetedGemIconProps) {
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

      {/* 상단 크라운(💎 윗면) */}
      <polygon points="32,6 14,28 32,34 50,28" fill={`url(#${id("top")})`} />
      {/* 좌측 면 */}
      <polygon points="14,28 32,34 32,58 14,28" fill={`url(#${id("left")})`} />
      {/* 우측 면 */}
      <polygon points="50,28 32,34 32,58 50,28" fill={`url(#${id("right")})`} />
      {/* 하단 팬션 */}
      <polygon points="32,34 22,58 32,58 42,58" fill={`url(#${id("bottom")})`} />

      {/* 외곽선 — 이모지처럼 단순 */}
      <polygon
        points="32,6 14,28 32,58 50,28"
        fill="none"
        stroke={p.edge}
        strokeWidth="0.8"
        strokeLinejoin="round"
        opacity="0.35"
      />

      {/* 하이라이트 */}
      <polygon points="32,10 24,24 32,28 40,24" fill="white" opacity="0.45" />
      <circle cx="26" cy="18" r="2" fill="white" opacity="0.7" />
    </svg>
  )
}
