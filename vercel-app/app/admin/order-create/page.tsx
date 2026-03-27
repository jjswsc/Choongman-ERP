"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { ShoppingCart } from "lucide-react"
import { AdminOrderCreate } from "@/components/erp/admin-order-create"
import { AdminOrderHistory } from "@/components/erp/admin-order-history"
import { AdminPurchaseOrder } from "@/components/erp/admin-purchase-order"
import { AdminPurchaseOrderHistory } from "@/components/erp/admin-purchase-order-history"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isManagerRole } from "@/lib/permissions"
import { OrderCreateProvider, useOrderCreate } from "@/lib/order-create-context"
import { resolveOrderCreateTabFromQuery } from "@/lib/order-create-tab"

function OrderCreateTabs() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const isManager = isManagerRole(auth?.role || "")
  const showHqTab = !isManager
  const ctx = useOrderCreate()
  const activeTab = ctx?.activeTab ?? "store"
  const setActiveTab = ctx?.setActiveTab ?? (() => {})

  return (
    <>
      {showHqTab ? (
        <Tabs value={activeTab} onValueChange={setActiveTab} className={adminTabsRootCn}>
          <div className={adminTabsBarCn}>
            <div className={adminTabsScrollCn}>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="store" className={adminTabsTriggerCn}>
                  {t("orderTabStore")}
                </TabsTrigger>
                <TabsTrigger value="storeHist" className={adminTabsTriggerCn}>
                  {t("orderTabStoreOrderHist")}
                </TabsTrigger>
                <TabsTrigger value="hq" className={adminTabsTriggerCn}>
                  {t("orderTabHq")}
                </TabsTrigger>
                <TabsTrigger value="history" className={adminTabsTriggerCn}>
                  {t("orderTabPoHistory")}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
          <TabsContent value="store" className={adminTabsContentCn}>
            <AdminOrderCreate />
          </TabsContent>
          <TabsContent value="storeHist" className={adminTabsContentCn}>
            <AdminOrderHistory />
          </TabsContent>
          <TabsContent value="hq" className={adminTabsContentCn}>
            <AdminPurchaseOrder allowManualLines />
          </TabsContent>
          <TabsContent value="history" className={adminTabsContentCn}>
            <AdminPurchaseOrderHistory />
          </TabsContent>
        </Tabs>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className={adminTabsRootCn}>
          <div className={adminTabsBarCn}>
            <div className={adminTabsScrollCn}>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="store" className={adminTabsTriggerCn}>
                  {t("orderTabStore")}
                </TabsTrigger>
                <TabsTrigger value="storeHist" className={adminTabsTriggerCn}>
                  {t("orderTabStoreOrderHist")}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>
          <TabsContent value="store" className={adminTabsContentCn}>
            <AdminOrderCreate />
          </TabsContent>
          <TabsContent value="storeHist" className={adminTabsContentCn}>
            <AdminOrderHistory />
          </TabsContent>
        </Tabs>
      )}
    </>
  )
}

function OrderCreatePageLayout() {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("adminOrderCreateTitle")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("adminOrderCreateSub")}
            </p>
          </div>
        </div>
        <OrderCreateTabs />
      </div>
    </div>
  )
}

function OrderCreatePageInner() {
  const searchParams = useSearchParams()
  const { auth } = useAuth()
  const isManager = isManagerRole(auth?.role || "")
  const initialTab = resolveOrderCreateTabFromQuery(searchParams.get("tab"), isManager)

  return (
    <OrderCreateProvider key={initialTab} defaultTab={initialTab}>
      <OrderCreatePageLayout />
    </OrderCreateProvider>
  )
}

function OrderCreateFallback() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

export default function OrderCreatePage() {
  return (
    <Suspense fallback={<OrderCreateFallback />}>
      <OrderCreatePageInner />
    </Suspense>
  )
}
