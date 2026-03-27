"use client"

import * as React from "react"
import Link from "next/link"
import { FileText } from "lucide-react"
import { AdminPurchaseOrder } from "@/components/erp/admin-purchase-order"
import { AdminPurchaseOrderHistory } from "@/components/erp/admin-purchase-order-history"
import { AdminPoBillingSettings } from "@/components/admin/admin-po-billing-settings"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isManagerRole } from "@/lib/permissions"

export default function AccountingPurchaseOrderPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const [tab, setTab] = React.useState("hq")
  const isManager = isManagerRole(auth?.role || "")

  if (isManager) {
    return (
      <div className="flex-1 overflow-auto px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-sm text-muted-foreground">{t("officeRoleOnly")}</p>
        <Button asChild variant="link" className="mt-2 h-auto p-0 text-sm">
          <Link href="/admin/order-create">{t("adminOrderCreate")}</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("adminAccountingPurchaseOrderTitle")}
            </h1>
            <p className="text-xs text-muted-foreground">{t("adminAccountingPurchaseOrderSub")}</p>
          </div>
        </div>
        <Tabs value={tab} onValueChange={setTab} className={adminTabsRootCn}>
          <div className={adminTabsBarCn}>
            <div className={adminTabsScrollCn}>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="hq" className={adminTabsTriggerCn}>
                  {t("orderTabHq")}
                </TabsTrigger>
                <TabsTrigger value="billing_settings" className={adminTabsTriggerCn}>
                  {t("poBillingTabSettings")}
                </TabsTrigger>
                <TabsTrigger value="history" className={adminTabsTriggerCn}>
                  {t("orderTabPoHistory")}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
          <TabsContent value="hq" className={adminTabsContentCn}>
            <AdminPurchaseOrder allowManualLines />
          </TabsContent>
          <TabsContent value="billing_settings" className={adminTabsContentCn}>
            <AdminPoBillingSettings />
          </TabsContent>
          <TabsContent value="history" className={adminTabsContentCn}>
            <AdminPurchaseOrderHistory />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
