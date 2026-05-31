"use client"

import * as React from "react"
import {
  ClipboardPenLine,
  FileWarning,
  LayoutList,
  LineChart,
  ListChecks,
} from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  adminTabsContentCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { EmployeeEvalTab, type EmployeeEvalJumpTarget } from "./employee-eval-tab"
import { EmployeeEvalListTab } from "./employee-eval-list-tab"
import { EmployeeEvalAnalyticsTab } from "./employee-eval-analytics-tab"
import { EmployeeEvalItemsSettingsTab } from "./employee-eval-items-settings-tab"
import { EmployeeWarningLettersTab } from "./employee-warning-letters-tab"
import { resolveEmployeeNickJobForEvalJump } from "@/lib/employee-eval-jump-resolve"
import type { EmployeeTableRow } from "./employee-table"

export type EmployeeEvalSubTab =
  | "register"
  | "analytics"
  | "list"
  | "warning-letters"
  | "items-setting"

export interface EmployeeEvalHubTabProps {
  subTab: EmployeeEvalSubTab
  onSubTabChange: (tab: EmployeeEvalSubTab) => void
  storesForForm: string[]
  storesForFilter: string[]
  allEmployees: EmployeeTableRow[]
  showRegisterTab: boolean
  showAnalyticsTab: boolean
  showListTab: boolean
  showWarningTab: boolean
  showItemsTab: boolean
  evalAnalyticsCanPickAllStores: boolean
  canUseAiSummary: boolean
  jumpToEmployee: EmployeeEvalJumpTarget | null
  onJumpToEmployeeConsumed: () => void
  evalSaveSerial: number
  onEvalSaved: () => void
  onOpenEvalRegister: (target: EmployeeEvalJumpTarget) => void
}

export function EmployeeEvalHubTab({
  subTab,
  onSubTabChange,
  storesForForm,
  storesForFilter,
  allEmployees,
  showRegisterTab,
  showAnalyticsTab,
  showListTab,
  showWarningTab,
  showItemsTab,
  evalAnalyticsCanPickAllStores,
  canUseAiSummary,
  jumpToEmployee,
  onJumpToEmployeeConsumed,
  evalSaveSerial,
  onEvalSaved,
  onOpenEvalRegister,
}: EmployeeEvalHubTabProps) {
  const { lang } = useLang()
  const t = useT(lang)

  const visibleSubTabs = React.useMemo(() => {
    const out: EmployeeEvalSubTab[] = []
    if (showRegisterTab) out.push("register")
    if (showAnalyticsTab) out.push("analytics")
    if (showListTab) out.push("list")
    if (showWarningTab) out.push("warning-letters")
    if (showItemsTab) out.push("items-setting")
    return out
  }, [showRegisterTab, showAnalyticsTab, showListTab, showWarningTab, showItemsTab])

  const activeSubTab = React.useMemo(() => {
    if (visibleSubTabs.includes(subTab)) return subTab
    return visibleSubTabs[0] ?? "list"
  }, [visibleSubTabs, subTab])

  React.useEffect(() => {
    if (activeSubTab !== subTab) onSubTabChange(activeSubTab)
  }, [activeSubTab, subTab, onSubTabChange])

  if (visibleSubTabs.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
        {t("noPermission")}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("tab_hr_eval_hub_desc")}</p>
      <Tabs
        value={activeSubTab}
        onValueChange={(v) => onSubTabChange(v as EmployeeEvalSubTab)}
        className="w-full"
      >
        <TabsList className={adminTabsListRowCn}>
          {showRegisterTab && (
            <TabsTrigger value="register" className={adminTabsTriggerCn}>
              <ClipboardPenLine className={adminTabsIconCn} aria-hidden />
              {t("tab_hr_eval_register")}
            </TabsTrigger>
          )}
          {showAnalyticsTab && (
            <TabsTrigger value="analytics" className={adminTabsTriggerCn}>
              <LineChart className={adminTabsIconCn} aria-hidden />
              {t("tab_hr_eval_analytics")}
            </TabsTrigger>
          )}
          {showListTab && (
            <TabsTrigger value="list" className={adminTabsTriggerCn}>
              <ListChecks className={adminTabsIconCn} aria-hidden />
              {t("tab_eval_list")}
            </TabsTrigger>
          )}
          {showWarningTab && (
            <TabsTrigger value="warning-letters" className={adminTabsTriggerCn}>
              <FileWarning className={adminTabsIconCn} aria-hidden />
              {t("tab_hr_warning_letters")}
            </TabsTrigger>
          )}
          {showItemsTab && (
            <TabsTrigger value="items-setting" className={adminTabsTriggerCn}>
              <LayoutList className={adminTabsIconCn} aria-hidden />
              {t("tab_eval_items_setting")}
            </TabsTrigger>
          )}
        </TabsList>

        {showRegisterTab && (
          <TabsContent value="register" className={adminTabsContentCn}>
            <EmployeeEvalTab
              stores={storesForForm}
              employees={allEmployees}
              onSaved={onEvalSaved}
              jumpToEmployee={jumpToEmployee}
              onJumpToEmployeeConsumed={onJumpToEmployeeConsumed}
            />
          </TabsContent>
        )}
        {showAnalyticsTab && (
          <TabsContent value="analytics" className={adminTabsContentCn}>
            <EmployeeEvalAnalyticsTab
              stores={storesForFilter}
              canPickAllStores={evalAnalyticsCanPickAllStores}
              canUseAiSummary={canUseAiSummary}
              onOpenEvalForUnevaluated={
                showRegisterTab
                  ? (row) => {
                      onOpenEvalRegister({
                        key: Date.now(),
                        store: row.store,
                        name: row.name,
                        nick: row.nick,
                        job: row.job,
                      })
                    }
                  : undefined
              }
            />
          </TabsContent>
        )}
        {showListTab && (
          <TabsContent value="list" className="mt-0 p-0 sm:p-0">
            <EmployeeEvalListTab
              stores={storesForFilter}
              onEditInEvalTab={
                showRegisterTab
                  ? (row) => {
                      const { nick, job } = resolveEmployeeNickJobForEvalJump(
                        allEmployees,
                        row.store,
                        row.employeeName
                      )
                      onOpenEvalRegister({
                        key: Date.now(),
                        store: row.store,
                        name: row.employeeName,
                        nick,
                        job,
                        evaluationId: row.id,
                      })
                    }
                  : undefined
              }
            />
          </TabsContent>
        )}
        {showWarningTab && (
          <TabsContent value="warning-letters" className={adminTabsContentCn}>
            <EmployeeWarningLettersTab
              stores={storesForFilter}
              employees={allEmployees}
              evalSaveSerial={evalSaveSerial}
              onOpenEval={(target) => {
                if (target.evalType === "standalone") return
                onOpenEvalRegister({
                  key: Date.now(),
                  store: target.store,
                  name: target.name,
                  nick: target.nick,
                  job: target.job,
                  evalType: target.evalType,
                  evaluationId: target.evaluationId,
                })
              }}
            />
          </TabsContent>
        )}
        {showItemsTab && (
          <TabsContent value="items-setting" className={adminTabsContentCn}>
            <EmployeeEvalItemsSettingsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
