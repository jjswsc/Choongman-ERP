"use client"

import Link from "next/link"
import {
  ShieldCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  ClipboardList,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

interface QuickAction {
  titleKey: string
  descKey: string
  icon: React.ElementType
  href: string
  color: string
  bgColor: string
}

const actions: QuickAction[] = [
  { titleKey: "adminOrders", descKey: "adminQuickOrderApprove", icon: ShieldCheck, href: "/admin/orders", color: "text-primary", bgColor: "bg-primary/10" },
  { titleKey: "adminInbound", descKey: "adminQuickInboundReg", icon: ArrowDownToLine, href: "/admin/inbound", color: "text-success", bgColor: "bg-success/10" },
  { titleKey: "adminOutbound", descKey: "adminQuickOutboundReg", icon: ArrowUpFromLine, href: "/admin/outbound", color: "text-warning", bgColor: "bg-warning/10" },
  { titleKey: "adminAttendance", descKey: "adminQuickAttManage", icon: CalendarClock, href: "/admin/attendance", color: "text-muted-foreground", bgColor: "bg-muted" },
]

export function QuickActions() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ClipboardList className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-card-foreground">{t("adminQuickActions")}</h3>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
        {actions.map((action) => (
          <Link
            key={action.titleKey}
            href={action.href}
            className="group flex flex-col items-center gap-2.5 rounded-lg border border-transparent bg-muted/50 p-4 text-center transition-all hover:border-border hover:bg-card hover:shadow-sm"
          >
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg transition-transform group-hover:scale-110",
                action.bgColor,
                action.color
              )}
            >
              <action.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-card-foreground">{t(action.titleKey)}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {t(action.descKey)}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
