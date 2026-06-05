"use client"

import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"

type AdminDashboardPendingOrdersAlertProps = {
  count: number
  className?: string
}

/** 대시보드 상단 — 미승인 발주 알림 (물류 승인 누락 방지) */
export function AdminDashboardPendingOrdersAlert({
  count,
  className,
}: AdminDashboardPendingOrdersAlertProps) {
  const { lang } = useLang()
  const t = useT(lang)

  if (count <= 0) return null

  return (
    <Link
      href="/admin/orders"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/15",
        className
      )}
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-destructive/15">
        <ShieldCheck className="h-4 w-4" />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
          {count > 99 ? "99+" : count}
        </span>
      </span>
      <span className="hidden sm:inline">
        {tOr(t, "adminDashboardPendingOrdersAlert", "미승인 주문 — 승인 필요")}
      </span>
      <span className="sm:hidden">{t("adminUnapprovedOrders")}</span>
    </Link>
  )
}
