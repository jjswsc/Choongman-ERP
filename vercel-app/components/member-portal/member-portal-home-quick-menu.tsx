"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import { Gift, MoreHorizontal, ShoppingCart, Soup, Ticket } from "lucide-react"
import type { MemberPortalKey } from "@/lib/member-portal-i18n"
import type { PortalTab } from "@/components/member-portal/portal-ui"
import { MP_MAX_WIDTH } from "@/lib/member-portal-design"
import { MP_HOME_QUICK_MENU_DOCK_BOTTOM } from "@/lib/member-portal-home-layout"

type QuickItem = {
  id: string
  tab: PortalTab
  icon: React.ReactNode
  titleKey: MemberPortalKey
  subKey: MemberPortalKey
}

const QUICK_ITEMS: QuickItem[] = [
  { id: "order", tab: "order", icon: <Soup className="h-[18px] w-[18px]" strokeWidth={2.2} />, titleKey: "homeQuickOrderTitle", subKey: "homeQuickOrder" },
  { id: "delivery", tab: "order", icon: <ShoppingCart className="h-[18px] w-[18px]" strokeWidth={2.2} />, titleKey: "homeQuickDeliveryTitle", subKey: "homeQuickDelivery" },
  { id: "privilege", tab: "privilege", icon: <Gift className="h-[18px] w-[18px]" strokeWidth={2.2} />, titleKey: "homeQuickPrivilegesTitle", subKey: "homeQuickPrivilegesSub" },
  { id: "coupons", tab: "privilege", icon: <Ticket className="h-[18px] w-[18px]" strokeWidth={2.2} />, titleKey: "homeQuickMyCouponsTitle", subKey: "homeQuickMyCoupons" },
  { id: "more", tab: "me", icon: <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2.4} />, titleKey: "homeQuickMoreTitle", subKey: "homeQuickMore" },
]

function QuickMenuBar({
  t,
  onNavigate,
}: {
  t: (key: MemberPortalKey) => string
  onNavigate: (tab: PortalTab) => void
}) {
  return (
    <nav
      className="grid h-16 grid-cols-5 items-center rounded-[18px] border border-white/60 bg-white/[0.92] px-1 py-1.5 shadow-[0_9px_22px_rgba(53,27,5,0.12)] backdrop-blur-md"
      aria-label={t("homeQuickMenuAria")}
    >
      {QUICK_ITEMS.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onNavigate(item.tab)}
          className="min-w-0 px-0.5 text-center text-[#222] transition active:scale-95"
        >
          <span className="mx-auto mb-[3px] grid h-9 w-9 place-items-center rounded-full bg-[#fff4e7] text-[#f25a13]">
            {item.icon}
          </span>
          <span className="block text-[8px] font-extrabold leading-[1.1]">{t(item.titleKey)}</span>
          <span className="block text-[7.5px] leading-[1.1] text-[#333]">{t(item.subKey)}</span>
        </button>
      ))}
    </nav>
  )
}

type Props = {
  t: (key: MemberPortalKey) => string
  onNavigate: (tab: PortalTab) => void
  embedPreview?: boolean
}

/** 홈 전용 — 하단 탭 바로 위 고정 독 (스크롤과 무관) */
export function MemberPortalHomeQuickMenu({ t, onNavigate, embedPreview = false }: Props) {
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const dock = (
    <div
      className={`${embedPreview ? "absolute" : "fixed"} inset-x-0 z-[65] px-4 pb-1.5`}
      style={{ bottom: embedPreview ? "4.75rem" : MP_HOME_QUICK_MENU_DOCK_BOTTOM }}
    >
      <div className={`mx-auto w-full ${MP_MAX_WIDTH}`}>
        <QuickMenuBar t={t} onNavigate={onNavigate} />
      </div>
    </div>
  )

  if (embedPreview || !mounted || typeof document === "undefined") return dock
  return createPortal(dock, document.body)
}
