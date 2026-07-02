"use client"


import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Wallet } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { AdminPayrollCalc } from "@/components/admin/admin-payroll-calc"
import { AdminPayrollRecords } from "@/components/admin/admin-payroll-records"
import { AdminPayrollSalaryHistory } from "@/components/admin/admin-payroll-salary-history"
import { AdminPayrollHolidays } from "@/components/admin/admin-payroll-holidays"
import { AdminPayrollRules } from "@/components/admin/admin-payroll-rules"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"
import { isOfficeRole, isManagerRole, isFranchiseeRole } from "@/lib/permissions"
import { PayrollHelpContent } from "@/components/admin/payroll-help-content"
import { HrPageShell } from "@/components/hr/hr-page-shell"

const PAYROLL_TABS = ["calc", "records", "salary_history", "holidays", "rules", "help"] as const
type PayrollTab = (typeof PAYROLL_TABS)[number]

function isPayrollTab(v: string | null): v is PayrollTab {
  return !!v && (PAYROLL_TABS as readonly string[]).includes(v)
}

function PayrollPageInner() {
  const { auth } = useAuth()
  const t = useT(useLang().lang)
  const searchParams = useSearchParams()
  const canAccessPayroll = isOfficeRole(auth?.role || "") || isManagerRole(auth?.role || "") || isFranchiseeRole(auth?.role || "")

  /** 탭은 URL과 분리(입고·출고와 동일). ?tab= 변경 시 keep-alive가 href별로 페이지를 나눠 계산 탭 편집 상태가 사라짐. */
  const [tabValue, setTabValue] = useState<PayrollTab>("calc")
  const tabFromUrlAppliedRef = useRef(false)

  useEffect(() => {
    if (tabFromUrlAppliedRef.current) return
    const rawTab = searchParams.get("tab")
    if (isPayrollTab(rawTab)) setTabValue(rawTab)
    tabFromUrlAppliedRef.current = true
  }, [searchParams])

  const setTab = (v: string) => {
    if (isPayrollTab(v)) setTabValue(v)
  }

  if (!canAccessPayroll) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-6 text-center max-w-md">
          <p className="font-semibold text-amber-800 dark:text-amber-200">{t("adminPayroll")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("adminPayrollAccessDenied")}</p>
        </div>
      </div>
    )
  }

  return (
    <HrPageShell icon={Wallet} title={t("adminPayroll")} subtitle={t("adminPayrollSub")}>
        <Tabs value={tabValue} onValueChange={setTab} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="calc" className={adminTabsTriggerCn}>
                  {t("pay_tab_calc")}
                </TabsTrigger>
                <TabsTrigger value="records" className={adminTabsTriggerCn}>
                  {t("pay_tab_records")}
                </TabsTrigger>
                <TabsTrigger value="salary_history" className={adminTabsTriggerCn}>
                  {t("pay_tab_salary_history")}
                </TabsTrigger>
                <TabsTrigger value="holidays" className={adminTabsTriggerCn}>
                  {t("pay_tab_holidays")}
                </TabsTrigger>
                <TabsTrigger value="rules" className={adminTabsTriggerCn}>
                  {t("pay_tab_rules")}
                </TabsTrigger>
                <TabsTrigger value="help" className={adminTabsTriggerCn}>
                  {t("pay_tab_help")}
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>
          <TabsContent value="calc" className={adminTabsContentCn}>
            <AdminPayrollCalc />
          </TabsContent>
          <TabsContent value="records" className={adminTabsContentCn}>
            <AdminPayrollRecords />
          </TabsContent>
          <TabsContent value="salary_history" className={adminTabsContentCn}>
            <AdminPayrollSalaryHistory />
          </TabsContent>
          <TabsContent value="holidays" className={adminTabsContentCn}>
            <AdminPayrollHolidays readOnly={isManagerRole(auth?.role || "")} />
          </TabsContent>
          <TabsContent value="rules" className={adminTabsContentCn}>
            <AdminPayrollRules />
          </TabsContent>
          <TabsContent value="help" className={cn(adminTabsContentCn, "space-y-4")}>
            <PayrollHelpContent />
          </TabsContent>
        </Tabs>
    </HrPageShell>
  )
}

export default function Page() {
  const t = useT(useLang().lang)
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">{t("loading")}</div>
      }
    >
      <PayrollPageInner />
    </Suspense>
  )
}
