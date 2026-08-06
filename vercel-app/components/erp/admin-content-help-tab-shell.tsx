"use client"

import * as React from "react"
import { usePathname, useSearchParams } from "next/navigation"
import {
  ADMIN_HELP_CONTENT_SHELL_EXCLUDED_MATCHED,
  hrefToHelpSummaryKey,
  matchErpNavHrefForHelp,
  shouldShowAdminHelpModeToggle,
} from "@/lib/admin-help-registry"
import { HelpSumHowBlocks } from "@/components/erp/help-sum-how-blocks"
import { AdminHelpHandoverPanel } from "@/components/erp/admin-help-handover-panel"
import {
  AdminHelpInlineRegistrationProvider,
  useAdminHelpInlineTabBarCount,
} from "@/components/erp/admin-help-inline-registration"
import { AdminHelpModeToggle, ERP_HELP_PARAM } from "@/components/erp/admin-help-mode-toggle"
import { AdminPageKeepAlive } from "@/components/erp/admin-page-keep-alive"

type AdminContentHelpTabShellProps = { children: React.ReactNode }

function AdminContentHelpShellBody({
  children,
  pathname,
  helpSumKey,
  matchedHref,
  shellActive,
}: {
  children: React.ReactNode
  pathname: string
  helpSumKey: string | null
  matchedHref: string | null
  /** `false`이면 도움말 스트립·패널 없이 keep-alive만 */
  shellActive: boolean
}) {
  const sp = useSearchParams()
  const inlineTabBarCount = useAdminHelpInlineTabBarCount()

  const hk = helpSumKey || ""
  const mh = matchedHref || ""
  const isHelp = shellActive && sp.get(ERP_HELP_PARAM) === "1"
  const showFallbackStrip =
    shellActive && inlineTabBarCount === 0 && shouldShowAdminHelpModeToggle(pathname)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showFallbackStrip ? (
        <div className="flex shrink-0 justify-end border-b border-border/30 bg-muted/10 px-3 py-1.5">
          <AdminHelpModeToggle />
        </div>
      ) : null}

      {/*
        KeepAlive는 항상 마운트 유지.
        - 바깥 Suspense로 감싸면 라우트 전환 중 fallback이 KeepAliveごと unmount → 검색 상태 소실
        - 도움말 모드에서도 KeepAlive를 트리에서 빼지 않음
      */}
      <div className={isHelp ? "hidden" : "min-h-0 flex-1"} aria-hidden={isHelp}>
        <AdminPageKeepAlive>
          <React.Suspense fallback={<div className="min-h-0 flex-1" aria-hidden />}>
            {children}
          </React.Suspense>
        </AdminPageKeepAlive>
      </div>

      {isHelp ? (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border/40 bg-muted/5 px-4 py-5 sm:px-6">
          <HelpSumHowBlocks helpSumKey={hk} detail />
          <AdminHelpHandoverPanel helpHref={mh} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * 급여·입고 등은 제외. 탭 행 오른쪽 `AdminTabsBarWithHelp`로 토글하거나,
 * 탭이 없는 화면은 상단 얇은 줄(우측 정렬)에 `AdminHelpModeToggle` 표시(도움말 모드에서도 동일 줄에「화면으로 돌아가기」).
 * `?erp_help=1`이면 도움말 본문.
 */
export function AdminContentHelpTabShell({ children }: AdminContentHelpTabShellProps) {
  const pathname = usePathname() || "/admin"
  const matched = React.useMemo(() => matchErpNavHrefForHelp(pathname), [pathname])
  const helpSumKey = matched ? hrefToHelpSummaryKey(matched) : null
  const shellActive = Boolean(
    helpSumKey && matched && !ADMIN_HELP_CONTENT_SHELL_EXCLUDED_MATCHED.has(matched)
  )

  return (
    <AdminHelpInlineRegistrationProvider>
      <AdminContentHelpShellBody
        pathname={pathname}
        helpSumKey={helpSumKey}
        matchedHref={matched}
        shellActive={shellActive}
      >
        {children}
      </AdminContentHelpShellBody>
    </AdminHelpInlineRegistrationProvider>
  )
}
