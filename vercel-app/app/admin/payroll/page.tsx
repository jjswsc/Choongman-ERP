"use client"

import { Wallet } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { AdminPayrollCalc } from "@/components/admin/admin-payroll-calc"
import { AdminPayrollRecords } from "@/components/admin/admin-payroll-records"
import { AdminPayrollHolidays } from "@/components/admin/admin-payroll-holidays"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useT } from "@/lib/i18n"
import { useLang } from "@/lib/lang-context"

export default function Page() {
  const { auth } = useAuth()
  const t = useT(useLang().lang)
  const isDirector = (auth?.role || "").toLowerCase().includes("director")

  if (!isDirector) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-6 text-center max-w-md">
          <p className="font-semibold text-amber-800 dark:text-amber-200">{t("adminPayroll")}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t("adminPayrollDirectorOnly")}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("adminPayroll")}</h1>
            <p className="text-xs text-muted-foreground">{t("pay_month")}</p>
          </div>
        </div>
        <Tabs defaultValue="calc" className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-3 mb-4">
            <TabsTrigger value="calc" className="text-sm font-medium">
              {t("pay_tab_calc")}
            </TabsTrigger>
            <TabsTrigger value="records" className="text-sm font-medium">
              {t("pay_tab_records")}
            </TabsTrigger>
            <TabsTrigger value="holidays" className="text-sm font-medium">
              {t("pay_tab_holidays")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="calc">
            <AdminPayrollCalc />
          </TabsContent>
          <TabsContent value="records">
            <AdminPayrollRecords />
          </TabsContent>
          <TabsContent value="holidays">
            <AdminPayrollHolidays />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
