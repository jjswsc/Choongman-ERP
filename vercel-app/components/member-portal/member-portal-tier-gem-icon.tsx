"use client"

import * as React from "react"
import type { TierFamily } from "@/lib/member-portal-tier-visual"
import { cn } from "@/lib/utils"

type TierFacetedGemIconProps = {
  family: TierFamily
  size?: number
  className?: string
}

type GemPalette = {
  highlight: string
  light: string
  mid: string
  deep: string
  shadow: string
  glow: string
}

const GEM_PALETTES: Record<TierFamily, GemPalette> = {
  bronze: {
    highlight: "#fff0dc",
    light: "#f0c89a",
    mid: "#cd7f32",
    deep: "#8b5a2b",
    shadow: "#4a2f18",
    glow: "rgba(205,127,50,0.55)",
  },
  silver: {
    highlight: "#ffffff",
    light: "#e8edf3",
    mid: "#b8c4d4",
    deep: "#6b7a8f",
    shadow: "#3d4654",
    glow: "rgba(148,163,184,0.5)",
  },
  gold: {
    highlight: "#fff9e8",
    light: "#fde68a",
    mid: "#f59e0b",
    deep: "#b45309",
    shadow: "#78350f",
    glow: "rgba(245,158,11,0.55)",
  },
  platinum: {
    highlight: "#ffffff",
    light: "#dbeafe",
    mid: "#94a3b8",
    deep: "#475569",
    shadow: "#1e293b",
    glow: "rgba(125,211,252,0.45)",
  },
  diamond: {
    highlight: "#faf5ff",
    light: "#ddd6fe",
    mid: "#8b5cf6",
    deep: "#5b21b6",
    shadow: "#3b0764",
    glow: "rgba(139,92,246,0.6)",
  },
  vip: {
    highlight: "#fff1f2",
    light: "#fda4af",
    mid: "#f43f5e",
    deep: "#be123c",
    shadow: "#881337",
    glow: "rgba(244,63,94,0.55)",
  },
  default: {
    highlight: "#fff7e6",
    light: "#fde68a",
    mid: "#d97706",
    deep: "#92400e",
    shadow: "#78350f",
    glow: "rgba(217,119,6,0.5)",
  },
}

/** 참고 디자인 스타일 — 면 분할·하이라이트·바닥 그림자가 있는 3D 보석 SVG */
export function TierFacetedGemIcon({ family, size = 48, className }: TierFacetedGemIconProps) {
  const uid = React.useId().replace(/:/g, "")
  const p = GEM_PALETTES[family] || GEM_PALETTES.default
  const id = (name: string) => `tier-gem-${uid}-${name}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 72"
      className={cn("drop-shadow-[0_8px_14px_var(--tier-gem-glow)]", className)}
      style={{ ["--tier-gem-glow" as string]: p.glow }}
      aria-hidden
    >
      <defs>
        <linearGradient id={id("table")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={p.highlight} />
          <stop offset="55%" stopColor={p.light} />
          <stop offset="100%" stopColor={p.mid} />
        </linearGradient>
        <linearGradient id={id("left")} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={p.light} />
          <stop offset="100%" stopColor={p.deep} />
        </linearGradient>
        <linearGradient id={id("right")} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={p.highlight} />
          <stop offset="100%" stopColor={p.mid} />
        </linearGradient>
        <linearGradient id={id("pavilion")} x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor={p.mid} />
          <stop offset="100%" stopColor={p.shadow} />
        </linearGradient>
        <linearGradient id={id("crown-l")} x1="100%" y1="20%" x2="0%" y2="80%">
          <stop offset="0%" stopColor={p.light} />
          <stop offset="100%" stopColor={p.deep} />
        </linearGradient>
        <linearGradient id={id("crown-r")} x1="0%" y1="20%" x2="100%" y2="80%">
          <stop offset="0%" stopColor={p.highlight} />
          <stop offset="100%" stopColor={p.mid} />
        </linearGradient>
      </defs>

      {/* 바닥 그림자 */}
      <ellipse cx="32" cy="67" rx="17" ry="3.2" fill="rgba(0,0,0,0.28)" />

      {/* 하단 팬션(뾰족한 면) */}
      <polygon points="32,66 14,36 50,36" fill={`url(#${id("pavilion")})`} />
      <polygon points="32,66 14,36 22,24" fill={p.shadow} opacity="0.55" />
      <polygon points="32,66 50,36 42,24" fill={p.mid} opacity="0.72" />

      {/* 크라운 좌·우 측면 */}
      <polygon points="14,36 22,24 32,30" fill={`url(#${id("crown-l")})`} />
      <polygon points="50,36 42,24 32,30" fill={`url(#${id("crown-r")})`} />

      {/* 상단 테이블(윗면) */}
      <polygon points="32,12 22,24 32,30 42,24" fill={`url(#${id("table")})`} />
      <polygon points="22,24 14,36 32,30" fill={`url(#${id("left")})`} opacity="0.92" />
      <polygon points="42,24 50,36 32,30" fill={`url(#${id("right")})`} opacity="0.95" />

      {/* 상단 광택 하이라이트 */}
      <polygon points="32,12 26,20 32,22 38,20" fill="white" opacity="0.55" />
      <polygon points="24,22 28,26 32,24" fill="white" opacity="0.22" />

      {/* 반짝 포인트 */}
      <circle cx="27" cy="18" r="1.6" fill="white" opacity="0.92" />
      <circle cx="36" cy="21" r="0.9" fill="white" opacity="0.55" />

      {/* 외곽 림 */}
      <polygon
        points="32,12 22,24 14,36 32,66 50,36 42,24"
        fill="none"
        stroke="white"
        strokeOpacity="0.18"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}
