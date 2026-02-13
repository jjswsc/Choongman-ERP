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

interface QuickAction {
  title: string
  description: string
  icon: React.ElementType
  href: string
  color: string
  bgColor: string
}

const actions: QuickAction[] = [
  {
    title: "주문 승인",
    description: "미승인 주문 처리",
    icon: ShieldCheck,
    href: "/admin/orders",
    color: "text-primary",
    bgColor: "bg-primary/10",
  },
  {
    title: "입고 등록",
    description: "새 입고 건 등록",
    icon: ArrowDownToLine,
    href: "/admin/inbound",
    color: "text-success",
    bgColor: "bg-success/10",
  },
  {
    title: "출고 등록",
    description: "새 출고 건 등록",
    icon: ArrowUpFromLine,
    href: "/admin/outbound",
    color: "text-warning",
    bgColor: "bg-warning/10",
  },
  {
    title: "근태 관리",
    description: "출퇴근 기록 확인",
    icon: CalendarClock,
    href: "/admin/attendance",
    color: "text-muted-foreground",
    bgColor: "bg-muted",
  },
]

export function QuickActions() {
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <ClipboardList className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold text-card-foreground">빠른 실행</h3>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
        {actions.map((action) => (
          <Link
            key={action.title}
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
              <p className="text-xs font-semibold text-card-foreground">{action.title}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {action.description}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
