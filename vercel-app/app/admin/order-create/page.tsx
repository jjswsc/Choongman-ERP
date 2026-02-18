"use client"

import { ShoppingCart } from "lucide-react"
import { AdminOrderCreate } from "@/components/erp/admin-order-create"
import { AdminOrderHistory } from "@/components/erp/admin-order-history"
import { AdminPurchaseOrder } from "@/components/erp/admin-purchase-order"
import { AdminPurchaseOrderHistory } from "@/components/erp/admin-purchase-order-history"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isManagerRole } from "@/lib/permissions"

export default function OrderCreatePage() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const isManager = isManagerRole(auth?.role || "")
  const showHqTab = !isManager

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

        {showHqTab ? (
          <Tabs defaultValue="store" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="store">{t("orderTabStore")}</TabsTrigger>
              <TabsTrigger value="storeHist">{t("orderTabStoreOrderHist")}</TabsTrigger>
              <TabsTrigger value="hq">{t("orderTabHq")}</TabsTrigger>
              <TabsTrigger value="history">{t("orderTabPoHistory")}</TabsTrigger>
            </TabsList>
            <TabsContent value="store">
              <AdminOrderCreate />
            </TabsContent>
            <TabsContent value="storeHist">
              <AdminOrderHistory />
            </TabsContent>
            <TabsContent value="hq">
              <AdminPurchaseOrder />
            </TabsContent>
            <TabsContent value="history">
              <AdminPurchaseOrderHistory />
            </TabsContent>
          </Tabs>
        ) : (
          <Tabs defaultValue="store" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="store">{t("orderTabStore")}</TabsTrigger>
              <TabsTrigger value="storeHist">{t("orderTabStoreOrderHist")}</TabsTrigger>
            </TabsList>
            <TabsContent value="store">
              <AdminOrderCreate />
            </TabsContent>
            <TabsContent value="storeHist">
              <AdminOrderHistory />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  )
}
