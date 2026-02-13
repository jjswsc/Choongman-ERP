"use client"

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

export default function AdminDashboardPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

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
            <StatCard
              title={t("adminUnapprovedOrders")}
              value={0}
              icon={ShieldCheck}
              variant="primary"
              description={t("adminPendingApprove")}
            />
            <StatCard
              title={t("adminThisMonthInbound")}
              value={12}
              icon={ArrowDownToLine}
              variant="success"
              trend={{ value: "8%", isPositive: true }}
            />
            <StatCard
              title={t("adminThisMonthOutbound")}
              value={67}
              icon={ArrowUpFromLine}
              variant="warning"
              trend={{ value: "15%", isPositive: true }}
            />
            <StatCard
              title={t("adminLeavePending")}
              value={4}
              icon={Palmtree}
              variant="destructive"
              description={t("adminLeaveApproveNeed")}
            />
            <StatCard
              title={t("adminAttPending")}
              value={0}
              icon={CalendarClock}
              variant="default"
              description={t("adminAttDone")}
            />
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
