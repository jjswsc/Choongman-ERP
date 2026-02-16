"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import {
  ShieldCheck,
  ArrowDownToLine,
  ArrowUpFromLine,
  Palmtree,
  CalendarClock,
} from "lucide-react"
import { StatCard } from "@/components/erp/stat-card"
import { NoticesPanel } from "@/components/erp/notices-panel"
import { QuickActions } from "@/components/erp/quick-actions"
import { RecentActivity } from "@/components/erp/recent-activity"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getAdminDashboardStats } from "@/lib/api-client"

export default function AdminDashboardPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [stats, setStats] = useState({
    unapprovedOrders: 0,
    thisMonthInbound: 0,
    thisMonthOutbound: 0,
    leavePending: 0,
    attPending: 0,
  })

  useEffect(() => {
    getAdminDashboardStats()
      .then(setStats)
      .catch(() => {})
  }, [])

  return (
    <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("adminDashboard")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("adminWelcome")}, <span className="font-semibold text-foreground">{auth?.user}</span>
              {t("adminWelcomeSub")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Link href="/admin/orders" className="block transition-opacity hover:opacity-90">
              <StatCard
                title={t("adminUnapprovedOrders")}
                value={stats.unapprovedOrders}
                icon={ShieldCheck}
                variant="primary"
                description={t("adminPendingApprove")}
              />
            </Link>
            <Link href="/admin/inbound" className="block transition-opacity hover:opacity-90">
              <StatCard
                title={t("adminThisMonthInbound")}
                value={stats.thisMonthInbound}
                icon={ArrowDownToLine}
                variant="success"
              />
            </Link>
            <Link href="/admin/outbound" className="block transition-opacity hover:opacity-90">
              <StatCard
                title={t("adminThisMonthOutbound")}
                value={stats.thisMonthOutbound}
                icon={ArrowUpFromLine}
                variant="warning"
              />
            </Link>
            <Link href="/admin/leave" className="block transition-opacity hover:opacity-90">
              <StatCard
                title={t("adminLeavePending")}
                value={stats.leavePending}
                icon={Palmtree}
                variant="destructive"
                description={t("adminLeaveApproveNeed")}
              />
            </Link>
            <Link href="/admin/attendance" className="block transition-opacity hover:opacity-90">
              <StatCard
                title={t("adminAttPending")}
                value={stats.attPending}
                icon={CalendarClock}
                variant="default"
                description={t("adminAttDone")}
              />
            </Link>
          </div>

          <div className="mt-6">
            <QuickActions />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <NoticesPanel />
            </div>
            <div className="lg:col-span-2">
              <RecentActivity />
            </div>
          </div>
        </div>
      </div>
  )
}
