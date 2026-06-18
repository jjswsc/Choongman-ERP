"use client"

import { Cake, Crown, Gift, Percent, Stamp, Ticket, type LucideIcon } from "lucide-react"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import type {
  MemberPortalHomePrivilegeIcon,
  MemberPortalHomePrivilegeLinkTab,
  MemberPortalHomePrivilegeResolved,
} from "@/lib/member-portal-home-privileges-config"
import { MP_TEXT_PRIMARY } from "@/lib/member-portal-design"
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
      <div className="mb-2 flex items-center justify-between gap-3 px-px">
        <h2 className={`m-0 text-sm font-black ${MP_TEXT_PRIMARY}`}>{t("homeSpecialPrivileges")}</h2>
        <button
          type="button"
          onClick={onViewAll}
          className="shrink-0 text-[9px] font-semibold text-[#3a2417] transition hover:text-[#2a1810]"
        >
          {t("homeViewAll")} ›
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {visible.map((item) => {
          const Icon = PRIVILEGE_ICON_MAP[item.icon] || Percent

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleCardClick(item.linkTab)}
              className="group flex h-[90px] flex-col items-center rounded-[14px] bg-gradient-to-br from-[#fffaf4] to-[#fff0df] px-1.5 pb-2 pt-[11px] text-center shadow-[0_4px_12px_rgba(50,25,5,0.04)] transition duration-200 hover:brightness-[1.02] active:scale-[0.98]"
            >
              <span className="mb-[5px] flex h-[34px] w-[34px] items-center justify-center rounded-full bg-gradient-to-br from-[#ff9b24] to-[#f05513] text-white shadow-[0_4px_10px_-2px_rgba(240,85,19,0.35)]">
                <Icon className="h-[18px] w-[18px]" strokeWidth={2.4} />
              </span>
              <p className={`line-clamp-2 text-[8.5px] font-black leading-[1.15] ${MP_TEXT_PRIMARY}`}>
                {item.title}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[6.7px] leading-[1.2] text-[#666]">{item.subtitle}</p>
            </button>
          )
        })}
      </div>
    </section>
  )
}
