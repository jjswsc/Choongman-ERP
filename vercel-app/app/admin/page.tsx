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

export default function AdminDashboardPage() {
  const { auth } = useAuth()

  return (
    <div className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h1 className="text-xl font-bold tracking-tight text-foreground">대시보드</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              환영합니다, <span className="font-semibold text-foreground">{auth?.user}</span>님. 오늘의 현황을 확인하세요.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              title="미승인 주문"
              value={0}
              icon={ShieldCheck}
              variant="primary"
              description="승인 대기 중"
            />
            <StatCard
              title="이번 달 입고"
              value={12}
              icon={ArrowDownToLine}
              variant="success"
              trend={{ value: "8%", isPositive: true }}
            />
            <StatCard
              title="이번 달 출고"
              value={67}
              icon={ArrowUpFromLine}
              variant="warning"
              trend={{ value: "15%", isPositive: true }}
            />
            <StatCard
              title="휴가 대기"
              value={4}
              icon={Palmtree}
              variant="destructive"
              description="승인 필요"
            />
            <StatCard
              title="근태 승인 대기"
              value={0}
              icon={CalendarClock}
              variant="default"
              description="처리 완료"
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
