"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ClipboardCheck, MapPin, MessageSquareWarning, RefreshCw, Wrench } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getStoreOpsAlertSummary,
  getStoreVisitTodaySnapshot,
  type StoreOpsAlertSummary,
} from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"

export function AdminStoreOpsHub() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [summary, setSummary] = useState<StoreOpsAlertSummary | null>(null)
  const [activeVisits, setActiveVisits] = useState(0)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [s, visit] = await Promise.all([
        getStoreOpsAlertSummary(),
        getStoreVisitTodaySnapshot({
          userStore: auth?.store || "",
          userRole: auth?.role || "",
        }).catch(() => ({ active: [] as { name: string }[] })),
      ])
      setSummary(s)
      setActiveVisits(Array.isArray(visit.active) ? visit.active.length : 0)
    } catch {
      setSummary(null)
      setActiveVisits(0)
    } finally {
      setLoading(false)
    }
  }, [auth?.store, auth?.role])

  useEffect(() => {
    void load()
  }, [load])

  const cards = [
    {
      label: t("store_ops_kpi_unchecked"),
      value: summary?.uncheckedToday ?? "—",
      sub: summary ? `${summary.checkedToday}/${summary.totalStores}` : "",
      href: "/admin/store-check",
      cta: t("store_ops_go_check"),
      icon: ClipboardCheck,
      className: "border-amber-500/40",
    },
    {
      label: t("store_ops_kpi_stale_repairs"),
      value: summary?.staleRepairs ?? "—",
      sub: t("repair_stale_days"),
      href: "/admin/store-repairs",
      cta: t("store_ops_go_repairs"),
      icon: Wrench,
      className: "border-red-500/40",
    },
    {
      label: t("store_ops_kpi_open_complaints"),
      value: summary?.openComplaints ?? "—",
      sub: t("complaint_status_recv"),
      href: "/admin/complaints",
      cta: t("store_ops_go_complaints"),
      icon: MessageSquareWarning,
      className: "border-orange-500/40",
    },
    {
      label: t("store_ops_kpi_active_visits"),
      value: activeVisits,
      sub: summary?.today ?? "",
      href: "/admin/store-visit",
      cta: t("store_ops_go_visits"),
      icon: MapPin,
      className: "border-emerald-500/40",
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? t("loading") : t("store_refresh")}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((k) => {
          const Icon = k.icon
          return (
            <Card key={k.label} className={`border-l-4 ${k.className}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                    <p className="text-2xl font-bold tabular-nums">{k.value}</p>
                    {k.sub ? <p className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</p> : null}
                  </div>
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />
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
