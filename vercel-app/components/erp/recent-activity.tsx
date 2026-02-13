"use client"

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ShieldCheck,
  Palmtree,
  Users,
  Clock,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface Activity {
  id: string
  type: "receiving" | "shipping" | "order" | "leave" | "employee"
  title: string
  description: string
  time: string
}

const activities: Activity[] = [
  {
    id: "1",
    type: "shipping",
    title: "출고 완료",
    description: "서울점 - 24건 출고 처리됨",
    time: "10분 전",
  },
  {
    id: "2",
    type: "receiving",
    title: "입고 등록",
    description: "본사 창고 - 신규 입고 12건",
    time: "25분 전",
  },
  {
    id: "3",
    type: "order",
    title: "주문 승인 완료",
    description: "부산점 주문 #2841 승인됨",
    time: "1시간 전",
  },
  {
    id: "4",
    type: "leave",
    title: "휴가 신청",
    description: "김민수 - 연차 (02/15 ~ 02/16)",
    time: "2시간 전",
  },
  {
    id: "5",
    type: "employee",
    title: "신규 직원 등록",
    description: "이지은 - 영업부 배정",
    time: "3시간 전",
  },
]

const typeConfig = {
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
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-3 border-b px-5 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Clock className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold text-card-foreground">최근 활동</h3>
      </div>
      <div className="divide-y">
        {activities.map((activity) => {
          const config = typeConfig[activity.type]
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
                  {activity.title}
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
