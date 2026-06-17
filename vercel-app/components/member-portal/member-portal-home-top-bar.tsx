"use client"

import * as React from "react"
import Image from "next/image"
import { Bell } from "lucide-react"
import { MP_HOME_CARD_RADIUS } from "@/lib/member-portal-home-layout"
import { MP_TEXT_SECONDARY } from "@/lib/member-portal-design"

type MemberPortalHomeTopBarProps = {
  wordmark: string
  logoSrc: string
  logoAlt: string
  langSelect: React.ReactNode
  onLogout: () => void
  logoutLabel: string
}

export function MemberPortalHomeTopBar({
  wordmark,
  logoSrc,
  logoAlt,
  langSelect,
  onLogout,
  logoutLabel,
}: MemberPortalHomeTopBarProps) {
  return (
    <header className="mb-3 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <div
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border border-stone-200/80 bg-white p-1 shadow-sm ${MP_HOME_CARD_RADIUS}`}
        >
          <Image src={logoSrc} alt={logoAlt} width={26} height={26} className="h-6 w-6 object-contain" />
        </div>
        <p className="truncate text-[11px] font-bold uppercase tracking-[0.18em] text-stone-800">{wordmark}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          className={`inline-flex h-9 w-9 items-center justify-center ${MP_HOME_CARD_RADIUS} border border-stone-200/80 bg-white text-stone-500 shadow-sm`}
          aria-label="Notifications"
          disabled
        >
          <Bell className="h-4 w-4" strokeWidth={1.75} />
        </button>
        {langSelect}
        <button
          type="button"
          onClick={onLogout}
          className={`inline-flex h-9 w-9 items-center justify-center ${MP_HOME_CARD_RADIUS} border border-stone-200/80 bg-white ${MP_TEXT_SECONDARY} shadow-sm transition hover:border-stone-300 hover:text-stone-800`}
          aria-label={logoutLabel}
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
          </svg>
        </button>
      </div>
    </header>
  )
}
