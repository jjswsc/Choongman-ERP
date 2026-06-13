"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { CalendarDays, CalendarClock, Palmtree, RefreshCw, Wallet } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { getAdminDashboardStats, getAdminEmployeeList } from "@/lib/api-client"
import { buildHrCalendarEvents } from "@/lib/hr-calendar-events"
import { addBangkokCalendarDays, getBangkokTodayDateString } from "@/lib/bangkok-time"
import { isOfficeRole, isManagerRole, isFranchiseeRole } from "@/lib/permissions"

export function AdminHrHub() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = useState(false)
  const [leavePending, setLeavePending] = useState(0)
  const [attPending, setAttPending] = useState(0)
  const [weekEvents, setWeekEvents] = useState(0)

  const canAccessPayroll =
    isOfficeRole(auth?.role || "") ||
    isManagerRole(auth?.role || "") ||
    isFranchiseeRole(auth?.role || "")

  const weekRangeLabel = useMemo(() => {
    const today = getBangkokTodayDateString()
    const end = addBangkokCalendarDays(today, 6)
    return `${today.slice(5).replace("-", "/")} – ${end.slice(5).replace("-", "/")}`
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const today = getBangkokTodayDateString()
      const weekEnd = addBangkokCalendarDays(today, 6)
      const viewYear = Number(today.slice(0, 4))
      const viewMonth = Number(today.slice(5, 7))

      const [stats, empRes] = await Promise.all([
        getAdminDashboardStats(),
        getAdminEmployeeList({
          userStore: auth?.store || "",
          userRole: auth?.role || "",
        }).catch(() => ({ list: [] as { store?: string; name?: string; nick?: string; birth?: string; join?: string; resign?: string }[] })),
      ])

      setLeavePending(stats.leavePending ?? 0)
      setAttPending(stats.attPending ?? 0)

      const list = (empRes as { list?: Parameters<typeof buildHrCalendarEvents>[0] }).list || []
      const monthEvents = buildHrCalendarEvents(list, {
        viewYear,
        viewMonth,
        storeFilter: "",
      })
      const inWeek = monthEvents.filter((ev) => ev.date >= today && ev.date <= weekEnd)
      setWeekEvents(inWeek.length)
    } catch {
      setLeavePending(0)
      setAttPending(0)
      setWeekEvents(0)
    } finally {
      setLoading(false)
    }
  }, [auth?.store, auth?.role])

  useEffect(() => {
    void load()
  }, [load])

  const cards = [
    {
      label: t("hr_hub_leave_pending"),
      value: leavePending,
      sub: "",
      href: "/admin/leave",
      cta: t("hr_hub_go_leave"),
      icon: Palmtree,
      className: "border-amber-500/40",
    },
    {
      label: t("hr_hub_att_pending"),
      value: attPending,
      sub: "",
      href: "/admin/attendance?tab=status",
      cta: t("hr_hub_go_att"),
      icon: CalendarClock,
      className: "border-orange-500/40",
    },
    {
      label: t("hr_hub_calendar_week"),
      value: weekEvents,
      sub: weekRangeLabel,
      href: "/admin/hr-calendar",
      cta: t("hr_hub_go_calendar"),
      icon: CalendarDays,
      className: "border-sky-500/40",
    },
    ...(canAccessPayroll
      ? [
          {
            label: t("hr_hub_payroll"),
            value: "→",
            sub: t("hr_hub_payroll_sub"),
            href: "/admin/payroll",
            cta: t("hr_hub_go_payroll"),
            icon: Wallet,
            className: "border-emerald-500/40",
          },
        ]
      : []),
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? t("loading") : t("store_refresh")}
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((k) => {
          const Icon = k.icon
          return (
            <Card key={k.label} className={`border-l-4 ${k.className}`}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-2xl font-bold tabular-nums">{k.value}</p>
                    {k.sub ? <p className="mt-0.5 text-[11px] text-muted-foreground">{k.sub}</p> : null}
                  </div>
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                </div>
                <Button asChild variant="secondary" size="sm" className="h-8 w-full text-xs">
                  <Link href={k.href}>{k.cta}</Link>
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
