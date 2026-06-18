"use client"

import * as React from "react"
import Image from "next/image"
import { Bell } from "lucide-react"
import { resolveTierFamily } from "@/lib/member-portal-tier-visual"
import { TierFacetedGemIcon } from "@/components/member-portal/member-portal-tier-gem-icon"

const CROWN_MARK = "♛"

type MemberPortalHomeTopBarProps = {
  greeting: string
  displayName: string
  tierName: string
  tierCode: string
  logoSrc: string
  logoAlt: string
  langSelect: React.ReactNode
  onLogout: () => void
  logoutLabel: string
  hasNotification?: boolean
}

/** choongman_member_home_only.html — header (로고·이름·tier-pill·벨) */
export function MemberPortalHomeTopBar({
  greeting,
  displayName,
  tierName,
  tierCode,
  logoSrc,
  logoAlt,
  langSelect,
  onLogout,
  logoutLabel,
  hasNotification = false,
}: MemberPortalHomeTopBarProps) {
  return (
    <header className="mb-2.5 flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="-rotate-[4deg] shrink-0 overflow-hidden rounded-[13px] border-[3px] border-[#fff0e4] bg-gradient-to-br from-[#ff5b18] to-[#e64b0d] shadow-[0_7px_14px_rgba(241,86,18,0.24)]">
          <div className="relative grid h-[50px] w-[50px] place-items-center">
            <Image src={logoSrc} alt={logoAlt} width={40} height={40} className="h-9 w-9 object-contain" />
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs leading-[1.15] text-[#2b2b2b]">{greeting}</p>
          <div className="flex items-center gap-1">
            <p className="truncate text-lg font-black leading-[1.1] text-[#161616]">{displayName}</p>
            <span className="shrink-0 text-[#d99500]" aria-hidden>
              {CROWN_MARK}
            </span>
          </div>
          <span className="mt-0.5 inline-flex w-max items-center gap-0.5 rounded-full bg-[#fff0e5] px-2 py-0.5 text-[10px] font-extrabold tracking-wide text-[#66331a]">
            <TierFacetedGemIcon family={resolveTierFamily(tierCode)} size={16} />
            <span className="uppercase">{tierName}</span>
          </span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <div className="flex items-center gap-1">
          {langSelect}
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#eee3d6] bg-white/90 text-stone-500 shadow-sm transition hover:text-stone-800"
            aria-label={logoutLabel}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          className="relative grid h-[38px] w-[38px] place-items-center rounded-full bg-[#fff4e7] text-stone-800"
          aria-label="Notifications"
          disabled
        >
          <Bell className="h-5 w-5" strokeWidth={1.9} />
          {hasNotification ? (
            <span className="absolute right-[3px] top-1 h-2 w-2 rounded-full border-2 border-[#fffdfa] bg-[#f25a13]" />
          ) : null}
        </button>
      </div>
    </header>
  )
}
