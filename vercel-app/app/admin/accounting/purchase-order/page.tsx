"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { FileText } from "lucide-react"
import { AdminPurchaseOrder } from "@/components/erp/admin-purchase-order"
import { AdminPurchaseOrderHistory } from "@/components/erp/admin-purchase-order-history"
import { AdminPoBillingSettings } from "@/components/admin/admin-po-billing-settings"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isManagerRole } from "@/lib/permissions"
import { AccountingPageShell } from "@/components/erp/accounting-page-shell"
export default function AccountingPurchaseOrderPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const [tab, setTab] = React.useState("hq")
  const searchParams = useSearchParams()
  React.useEffect(() => {
    const q = String(searchParams.get("tab") || "").trim()
    if (q === "billing_settings") setTab("billing_settings")
  }, [searchParams])
  const isManager = isManagerRole(auth?.role || "")

  if (isManager) {
    return (
      <AccountingPageShell hideHeader>
        <p className="text-sm text-muted-foreground">{t("officeRoleOnly")}</p>
        <Button asChild variant="link" className="mt-2 h-auto p-0 text-sm">
          <Link href="/admin/order-create">{t("adminOrderCreate")}</Link>
        </Button>
      </AccountingPageShell>
    )
  }

  return (
    <AccountingPageShell
      icon={FileText}
      title={t("adminAccountingPurchaseOrderTitle")}
      subtitle={t("adminAccountingPurchaseOrderSub")}
    >
      <Tabs value={tab} onValueChange={setTab} className={adminTabsRootCn}>
        <AdminTabsBarWithHelp>
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
        </AdminTabsBarWithHelp>
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
    </AccountingPageShell>
  )
}
