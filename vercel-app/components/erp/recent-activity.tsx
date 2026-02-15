"use client"

import { useEffect, useState } from "react"
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  Palmtree,
  Users,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getAdminRecentActivity } from "@/lib/api-client"
import type { AdminActivityItem } from "@/lib/api-client"

const fallbackActivities: AdminActivityItem[] = [
  { id: "1", type: "shipping", titleKey: "adminActOutboundDone", description: "-", time: "-" },
  { id: "2", type: "receiving", titleKey: "adminActInboundReg", description: "-", time: "-" },
  { id: "3", type: "order", titleKey: "adminActOrderApproved", description: "-", time: "-" },
]

const typeConfig: Record<string, { icon: typeof ArrowDownToLine; color: string; bg: string }> = {
  receiving: {
    icon: ArrowDownToLine,
    color: "text-success",
    bg: "bg-success/10",
  },
  shipping: {
    icon: ArrowUpFromLine,
    color: "text-warning",
    bg: "bg-warning/10",
  },
  order: {
    icon: ShieldCheck,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  leave: {
    icon: Palmtree,
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
  employee: {
    icon: Users,
    color: "text-muted-foreground",
    bg: "bg-muted",
  },
}

export function RecentActivity() {
  const { lang } = useLang()
  const t = useT(lang)
  const [activities, setActivities] = useState<AdminActivityItem[]>(fallbackActivities)

  useEffect(() => {
    getAdminRecentActivity()
      .then((list) => setActivities(Array.isArray(list) && list.length > 0 ? list : fallbackActivities))
      .catch(() => {})
  }, [])

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Clock className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold text-card-foreground">{t("adminRecentActivity")}</h3>
      </div>
      <div className="divide-y">
        {activities.map((activity) => {
          const config = typeConfig[activity.type] || typeConfig.receiving
          const Icon = config.icon
          return (
            <div
              key={activity.id}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/50"
            >
              <div
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  config.bg,
                  config.color
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-card-foreground">
                  {t(activity.titleKey)}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {activity.description}
                </p>
              </div>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {activity.time}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
