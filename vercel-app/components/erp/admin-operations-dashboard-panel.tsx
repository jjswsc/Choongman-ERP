"use client"

import Link from "next/link"
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
import { PushNotificationSetup } from "@/components/push-notification-setup"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAdminDashboardStats } from "@/lib/use-admin-dashboard-stats"

/** 물류·운영 담당용 대시보드 — 미승인 주문·입출고·휴가/근태 집계 */
export function AdminOperationsDashboardPanel() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const { stats } = useAdminDashboardStats()

  return (
    <>
      {auth?.store && auth?.user ? (
        <div>
          <PushNotificationSetup store={auth.store} name={auth.user} />
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Link href="/admin/orders" className="block h-full min-h-[132px] transition-opacity hover:opacity-90">
          <StatCard
            title={t("adminUnapprovedOrders")}
            value={stats.unapprovedOrders}
            icon={ShieldCheck}
            variant="primary"
            description={t("adminPendingApprove")}
          />
        </Link>
        <Link href="/admin/inbound" className="block h-full min-h-[132px] transition-opacity hover:opacity-90">
          <StatCard
            title={t("adminThisMonthInbound")}
            value={stats.thisMonthInbound}
            icon={ArrowDownToLine}
            variant="success"
          />
        </Link>
        <Link href="/admin/outbound" className="block h-full min-h-[132px] transition-opacity hover:opacity-90">
          <StatCard
            title={t("adminThisMonthOutbound")}
            value={stats.thisMonthOutbound}
            icon={ArrowUpFromLine}
            variant="warning"
          />
        </Link>
        <Link href="/admin/leave" className="block h-full min-h-[132px] transition-opacity hover:opacity-90">
          <StatCard
            title={t("adminLeavePending")}
            value={stats.leavePending}
            icon={Palmtree}
            variant="destructive"
            description={t("adminLeaveApproveNeed")}
          />
        </Link>
        <Link href="/admin/attendance" className="block h-full min-h-[132px] transition-opacity hover:opacity-90">
          <StatCard
            title={t("adminAttPending")}
            value={stats.attPending}
            icon={CalendarClock}
            variant="default"
            description={t("adminAttDone")}
          />
        </Link>
      </div>

      <QuickActions />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <NoticesPanel />
        </div>
        <div className="lg:col-span-2">
          <RecentActivity />
        </div>
      </div>
    </>
  )
}
