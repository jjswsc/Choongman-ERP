"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { adminTabsBarCn, adminTabsBarStickyCn, adminTabsScrollCn } from "@/lib/admin-tab-styles"
import { shouldShowAdminHelpModeToggle } from "@/lib/admin-help-registry"
import { cn } from "@/lib/utils"
import { AdminHelpModeToggle } from "@/components/erp/admin-help-mode-toggle"
import { useRegisterAdminHelpInTabBar } from "@/components/erp/admin-help-inline-registration"

type AdminTabsBarWithHelpProps = {
  children: React.ReactNode
  className?: string
  /** `false`이면 기존과 동일하게 탭만 (중첩 탭·전용 가이드 화면) */
  withHelp?: boolean
  /** 스크롤 시 탭바 상단 고정 (물류·재고 등 긴 화면) */
  sticky?: boolean
}

/**
 * `adminTabsBarCn` + 스크롤 영역 + (선택) 탭 행 오른쪽「도움말」/도움말 모드 시「화면으로 돌아가기」
 */
export function AdminTabsBarWithHelp({
  children,
  className,
  withHelp = true,
  sticky = true,
}: AdminTabsBarWithHelpProps) {
  const pathname = usePathname() || "/admin"
  const showToggle = withHelp && shouldShowAdminHelpModeToggle(pathname)
  useRegisterAdminHelpInTabBar(showToggle)

  return (
    <div
      className={cn(
        sticky ? adminTabsBarStickyCn : adminTabsBarCn,
        "flex flex-row items-stretch gap-0",
        className
      )}
    >
      <div className={cn(adminTabsScrollCn, "min-w-0 flex-1")}>{children}</div>
      {showToggle ? (
        <div className="flex shrink-0 items-center border-l border-border/50 bg-muted/10 px-1.5 py-1 sm:px-2">
          <AdminHelpModeToggle size="xs" />
        </div>
      ) : null}
    </div>
  )
}
