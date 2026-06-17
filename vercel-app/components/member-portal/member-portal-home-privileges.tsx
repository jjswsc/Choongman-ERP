"use client"

import { Cake, ChevronRight, Crown, Gift, Percent, Stamp, Ticket, type LucideIcon } from "lucide-react"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import type {
  MemberPortalHomePrivilegeIcon,
  MemberPortalHomePrivilegeLinkTab,
  MemberPortalHomePrivilegeResolved,
} from "@/lib/member-portal-home-privileges-config"
import { MP_HOME_CARD_RADIUS } from "@/lib/member-portal-home-layout"
import { MP_TEXT_PRIMARY, MP_TEXT_SECONDARY } from "@/lib/member-portal-design"
import type { PortalTab } from "@/components/member-portal/portal-ui"

type MemberPortalHomePrivilegesProps = {
  items: MemberPortalHomePrivilegeResolved[]
  t: (key: MemberPortalKey) => string
  onViewAll: () => void
  onNavigateTab?: (tab: PortalTab) => void
}

const PRIVILEGE_ICON_MAP: Record<MemberPortalHomePrivilegeIcon, LucideIcon> = {
  percent: Percent,
  cake: Cake,
  crown: Crown,
  ticket: Ticket,
  gift: Gift,
  stamp: Stamp,
}

function linkTabToPortalTab(linkTab: MemberPortalHomePrivilegeLinkTab): PortalTab | null {
  if (linkTab === 'none') return null
  return linkTab
}

export function MemberPortalHomePrivileges({
  items,
  t,
  onViewAll,
  onNavigateTab,
}: MemberPortalHomePrivilegesProps) {
  const visible = items.slice(0, 3)
  if (!visible.length) return null

  const handleCardClick = (linkTab: MemberPortalHomePrivilegeLinkTab) => {
    const tab = linkTabToPortalTab(linkTab)
    if (tab && onNavigateTab) {
      onNavigateTab(tab)
      return
    }
    onViewAll()
  }

  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className={`text-[15px] font-bold tracking-tight ${MP_TEXT_PRIMARY}`}>{t("homeSpecialPrivileges")}</h2>
        <button
          type="button"
          onClick={onViewAll}
          className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-amber-700 transition hover:text-amber-800"
        >
          {t("homeViewAll")}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {visible.map((item) => {
          const Icon = PRIVILEGE_ICON_MAP[item.icon] || Percent

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleCardClick(item.linkTab)}
              className={`group relative flex flex-col items-center overflow-hidden ${MP_HOME_CARD_RADIUS} border border-amber-100/90 bg-gradient-to-b from-white to-[#fff4e3] px-2 py-4 text-center shadow-[0_6px_18px_-6px_rgba(180,120,30,0.28),inset_0_1px_0_rgba(255,255,255,0.9)] transition-all duration-200 hover:-translate-y-1 hover:border-amber-200 hover:shadow-[0_14px_28px_-8px_rgba(180,120,30,0.4)] active:translate-y-0`}
            >
              <span className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-white/70 to-transparent" />
              <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-[0_6px_14px_-3px_rgba(217,119,6,0.55)] ring-1 ring-white/40 transition-transform duration-200 group-hover:scale-105">
                <span className="pointer-events-none absolute inset-x-1 top-1 h-1/2 rounded-full bg-gradient-to-b from-white/55 to-transparent" />
                <Icon className="relative h-[1.35rem] w-[1.35rem]" strokeWidth={2.1} />
              </span>
              <p className={`relative mt-2.5 line-clamp-2 min-h-[2.25rem] text-[11px] font-bold leading-snug ${MP_TEXT_PRIMARY}`}>
                {item.title}
              </p>
              <p className={`relative mt-1 line-clamp-2 text-[10px] leading-snug ${MP_TEXT_SECONDARY}`}>{item.subtitle}</p>
            </button>
          )
        })}
      </div>
    </section>
  )
}
