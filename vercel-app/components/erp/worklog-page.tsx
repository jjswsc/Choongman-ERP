"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import * as React from "react"
import { useSearchParams } from "next/navigation"
import { ClipboardList, User, ShieldCheck, BarChart3, History, Sparkles } from "lucide-react"
import {
  adminTabsContentCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WorklogMy } from "./worklog-my"
import { WorklogApproval } from "./worklog-approval"
import { WorklogWeekly } from "./worklog-weekly"
import { WorklogAuditPanel } from "./worklog-audit-panel"
import { WorklogInsightsPanel } from "./worklog-insights-panel"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { canViewWorkLogApprovalTab, canReviewWorkLog } from "@/lib/permissions"
import { getWorkLogManagerReport } from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { cn } from "@/lib/utils"
import {
  readWorklogQueryDraft,
  useWorklogQueryDraftPersistence,
  worklogQueryDraftKey,
} from "@/lib/worklog-query-draft"

const WORKLOG_TABS = new Set(["my", "approval", "weekly", "insights", "audit"])

type WorklogTabDraft = { tab?: string }

function readInitialWorklogTab(searchParams: URLSearchParams, user: string): string {
  const fromUrl = searchParams.get("tab") || ""
  if (WORKLOG_TABS.has(fromUrl)) return fromUrl
  const saved = readWorklogQueryDraft<WorklogTabDraft>(worklogQueryDraftKey("page-tab", user))
  if (saved?.tab && WORKLOG_TABS.has(saved.tab)) return saved.tab
  return "my"
}

export function WorklogPage() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const searchParams = useSearchParams()
  const role = auth?.role || ""
  const showApproval = canViewWorkLogApprovalTab(role)
  const showOfficeTabs = canReviewWorkLog(role)
  const [tab, setTab] = React.useState(() => readInitialWorklogTab(searchParams, auth?.user || ""))
  const [pendingCount, setPendingCount] = React.useState(0)
  const tabHydratedForUserRef = React.useRef(auth?.user || "")

  const tabDraft = React.useMemo<WorklogTabDraft>(() => ({ tab }), [tab])
  useWorklogQueryDraftPersistence({
    storageKey: worklogQueryDraftKey("page-tab", auth?.user || ""),
    draft: tabDraft,
    shouldPersist: tab !== "my",
    // 초기 state / auth hydrate에서 복원. 여기서 다시 apply하면 URL ?tab= 을 덮어쓸 수 있음.
    applyDraft: () => "skip",
  })

  // 첫 렌더에 auth가 비어 있으면 page-tab 초안을 못 읽음 → 사용자 확정 후 1회 보정
  React.useEffect(() => {
    const user = auth?.user || ""
    if (!user || tabHydratedForUserRef.current === user) return
    tabHydratedForUserRef.current = user
    const fromUrl = searchParams.get("tab") || ""
    if (WORKLOG_TABS.has(fromUrl)) return
    const saved = readWorklogQueryDraft<WorklogTabDraft>(worklogQueryDraftKey("page-tab", user))
    if (saved?.tab && WORKLOG_TABS.has(saved.tab)) setTab(saved.tab)
  }, [auth?.user, searchParams])

  React.useEffect(() => {
    if (tab === "approval" && !showApproval) setTab("my")
    if ((tab === "insights" || tab === "audit") && !showOfficeTabs) setTab("my")
  }, [tab, showApproval, showOfficeTabs])

  const refreshPendingCount = React.useCallback(async () => {
    if (!showApproval) return
    try {
      const today = getBangkokTodayDateString()
      const rows = await getWorkLogManagerReport({
        startStr: today,
        endStr: today,
        status: "대기",
      })
      setPendingCount(rows.filter((r) => r.managerCheck === "대기").length)
    } catch {
      setPendingCount(0)
    }
  }, [showApproval])

  React.useEffect(() => {
    void refreshPendingCount()
  }, [refreshPendingCount])

  React.useEffect(() => {
    if (tab === "approval") void refreshPendingCount()
  }, [tab, refreshPendingCount])

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <ClipboardList className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">{t("adminWorkLog")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("workLogSubtitle")}</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab} className={adminTabsRootCn}>
        <AdminTabsBarWithHelp>
          <TabsList className={adminTabsListRowCn}>
            <TabsTrigger value="my" className={adminTabsTriggerCn}>
              <User className={adminTabsIconCn} aria-hidden />
              {t("workLogTabMy")}
            </TabsTrigger>
            {showApproval && (
              <TabsTrigger value="approval" className={cn(adminTabsTriggerCn, "relative")}>
                <ShieldCheck className={adminTabsIconCn} aria-hidden />
                {t("workLogTabApproval")}
                {pendingCount > 0 && (
                  <span className="ml-1.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground">
                    {pendingCount}
                  </span>
                )}
              </TabsTrigger>
            )}
            <TabsTrigger value="weekly" className={adminTabsTriggerCn}>
              <BarChart3 className={adminTabsIconCn} aria-hidden />
              {t("workLogTabWeekly")}
            </TabsTrigger>
            {showOfficeTabs && (
              <>
                <TabsTrigger value="insights" className={adminTabsTriggerCn}>
                  <Sparkles className={adminTabsIconCn} aria-hidden />
                  {t("workLogTabInsights")}
                </TabsTrigger>
                <TabsTrigger value="audit" className={adminTabsTriggerCn}>
                  <History className={adminTabsIconCn} aria-hidden />
                  {t("workLogTabAudit")}
                </TabsTrigger>
              </>
            )}
          </TabsList>
        </AdminTabsBarWithHelp>

        <TabsContent value="my" className={adminTabsContentCn}>
          {auth?.user ? (
            <React.Suspense fallback={null}>
              <WorklogMy
                userName={auth.user}
                employeeId={auth.employeeId != null && auth.employeeId > 0 ? auth.employeeId : undefined}
              />
            </React.Suspense>
          ) : (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              {t("workLogLoginRequired")}
            </div>
          )}
        </TabsContent>
        {showApproval && (
          <TabsContent value="approval" className={adminTabsContentCn}>
            <WorklogApproval onPendingChange={setPendingCount} />
          </TabsContent>
        )}
        <TabsContent value="weekly" className={adminTabsContentCn}>
          <WorklogWeekly />
        </TabsContent>
        {showOfficeTabs && (
          <>
            <TabsContent value="insights" className={adminTabsContentCn}>
              <WorklogInsightsPanel />
            </TabsContent>
            <TabsContent value="audit" className={adminTabsContentCn}>
              <WorklogAuditPanel />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  )
}
