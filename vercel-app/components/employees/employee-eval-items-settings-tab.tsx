"use client"

import * as React from "react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isManagerRole } from "@/lib/permissions"
import { useAuth } from "@/lib/auth-context"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { adminTabsListRowCn, adminTabsTriggerCn } from "@/lib/admin-tab-styles"
import { EmployeeEvalSettingTab } from "./employee-eval-setting-tab"

/** 주방·서비스·매니저 평가 항목을 하위 탭으로 묶음 */
export function EmployeeEvalItemsSettingsTab() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const readOnly = isManagerRole(auth?.role || "")

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <h6 className="mb-2 border-b border-border pb-2 text-sm font-bold">
          {t("tab_eval_items_setting")}
        </h6>
        <p className="mb-4 text-sm text-muted-foreground">{t("tab_eval_items_setting_desc")}</p>
        <Tabs defaultValue="kitchen" className="w-full">
          <TabsList className={adminTabsListRowCn}>
            <TabsTrigger value="kitchen" className={adminTabsTriggerCn}>
              {t("tab_eval_kitchen_setting")}
            </TabsTrigger>
            <TabsTrigger value="service" className={adminTabsTriggerCn}>
              {t("tab_eval_service_setting")}
            </TabsTrigger>
            <TabsTrigger value="manager" className={adminTabsTriggerCn}>
              {t("tab_eval_manager_setting")}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="kitchen" className="mt-4 focus-visible:outline-none">
            <EmployeeEvalSettingTab type="kitchen" readOnly={readOnly} embedded />
          </TabsContent>
          <TabsContent value="service" className="mt-4 focus-visible:outline-none">
            <EmployeeEvalSettingTab type="service" readOnly={readOnly} embedded />
          </TabsContent>
          <TabsContent value="manager" className="mt-4 focus-visible:outline-none">
            <EmployeeEvalSettingTab type="manager" readOnly={readOnly} embedded />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
