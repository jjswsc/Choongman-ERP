"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import * as React from "react"
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
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { resolvePoIssuerStoreFromAuth } from "@/lib/po-issuer-scope"
import { AccountingPageShell } from "@/components/erp/accounting-page-shell"
import { useErpAllowUrlSync, useErpPageActiveRef } from "@/lib/erp-page-visibility"
import {
  patchPurchaseOrderViewCache,
  readPurchaseOrderViewCache,
  type PurchaseOrderPageTab,
} from "@/lib/purchase-order-view-cache"
import { useAdminUrlTab } from "@/lib/use-admin-url-tab"

const PO_TABS = ["hq", "billing_settings", "history"] as const

export default function AccountingPurchaseOrderPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const [tab, setTab] = useAdminUrlTab("tab", PO_TABS, "hq")
  const allowPoUrlSync = useErpAllowUrlSync("/admin/accounting/purchase-order")
  const pageActiveRef = useErpPageActiveRef()
  const tabCacheRestoredRef = React.useRef(false)

  React.useEffect(() => {
    if (tabCacheRestoredRef.current) return
    if (!pageActiveRef.current || !allowPoUrlSync) return
    tabCacheRestoredRef.current = true
    const snap = readPurchaseOrderViewCache()
    const cached = snap?.tab
    if (cached && PO_TABS.includes(cached) && cached !== tab) {
      setTab(cached)
      return
    }
    patchPurchaseOrderViewCache({ tab: tab as PurchaseOrderPageTab })
  }, [allowPoUrlSync, pageActiveRef, setTab, tab])

  const selectTab = React.useCallback(
    (value: string) => {
      const next = value as PurchaseOrderPageTab
      setTab(next)
      patchPurchaseOrderViewCache({ tab: next })
    },
    [setTab]
  )
  const isStoreIssuer = Boolean(
    auth && resolvePoIssuerStoreFromAuth({ role: auth.role, store: auth.store })
  )

  return (
    <AccountingPageShell
      icon={FileText}
      title={t("adminAccountingPurchaseOrderTitle")}
      subtitle={
        isStoreIssuer ? t("adminAccountingPurchaseOrderSubStore") : t("adminAccountingPurchaseOrderSub")
      }
    >
      <Tabs
        value={tab}
        onValueChange={selectTab}
        className={adminTabsRootCn}
      >
        <AdminTabsBarWithHelp>
          <TabsList className={adminTabsListRowCn}>
            <TabsTrigger value="hq" className={adminTabsTriggerCn}>
              {isStoreIssuer ? t("orderTabStoreBilling") : t("orderTabHq")}
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
          <AdminPurchaseOrderHistory
            onEditDraft={() => {
              setTab("hq")
              patchPurchaseOrderViewCache({ tab: "hq" })
            }}
          />
        </TabsContent>
      </Tabs>
    </AccountingPageShell>
  )
}
