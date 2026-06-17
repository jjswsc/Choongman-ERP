"use client"

import * as React from "react"
import Image from "next/image"
import { Bell, Crown } from "lucide-react"
import { cn } from "@/lib/utils"

type MemberPortalHomeTopBarProps = {
  greeting: string
  displayName: string
  tierName: string
  /** 등급별 젬 그라데이션 (tier.gem) */
  tierGem: string
  logoSrc: string
  logoAlt: string
  langSelect: React.ReactNode
  onLogout: () => void
  logoutLabel: string
  hasNotification?: boolean
}

export function MemberPortalHomeTopBar({
  greeting,
  displayName,
  tierName,
  tierGem,
  logoSrc,
  logoAlt,
  langSelect,
  onLogout,
  logoutLabel,
  hasNotification = false,
}: MemberPortalHomeTopBarProps) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-white shadow-sm">
          <Image src={logoSrc} alt={logoAlt} width={34} height={34} className="h-8 w-8 object-contain" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-stone-500">{greeting}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className="truncate text-[1.35rem] font-extrabold leading-tight tracking-tight text-stone-900">
              {displayName}
            </p>
            <Crown className="h-4 w-4 shrink-0 text-amber-500" strokeWidth={2.25} aria-hidden />
          </div>
          <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5">
            <span className={cn("h-2.5 w-2.5 rotate-45 rounded-[3px] bg-gradient-to-br", tierGem)} aria-hidden />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-800">{tierName}</span>
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <button
          type="button"
          className="relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-600 shadow-sm"
          aria-label="Notifications"
          disabled
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.9} />
          {hasNotification ? (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
          ) : null}
        </button>
        <div className="flex items-center gap-1.5">
          {langSelect}
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 bg-white text-stone-500 shadow-sm transition hover:border-stone-300 hover:text-stone-800"
            aria-label={logoutLabel}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
      </div>
    </header>
  )
}
