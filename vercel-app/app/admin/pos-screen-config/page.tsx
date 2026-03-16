"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { LayoutGrid, Monitor, CreditCard, Truck, TimerReset } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PosTableLayoutContent } from "@/components/pos/pos-table-layout-content"
import { PosCookingRulesContent } from "@/components/pos/pos-cooking-rules-content"
import { PosDeliveryAppsContent } from "@/components/pos/pos-delivery-apps-content"
import { PosPaymentSettingsContent } from "@/components/pos/pos-payment-settings-content"
import { PosTerminalMenuScreen } from "@/components/pos/pos-terminal-menu-screen"
import { PosMenuBoardManagementContent } from "@/components/pos/pos-menu-board-management-content"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"


export default function PosScreenConfigPage() {
  const searchParams = useSearchParams()
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const tabParam = searchParams.get("tab") || "tables"
  const [activeTab, setActiveTab] = React.useState(
    ["tables", "cook-timer", "menus", "payment", "delivery"].includes(tabParam) ? tabParam : "tables"
  )
  const [menusSubTab, setMenusSubTab] = React.useState<"menu-screen" | "menu-board">("menu-screen")

  React.useEffect(() => {
    const t = searchParams.get("tab")
    if (t && ["tables", "cook-timer", "menus", "payment", "delivery"].includes(t)) setActiveTab(t)
  }, [searchParams])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Monitor className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("posScreenConfig") || "POS 화면 구성"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("posScreenConfigSub") || "테이블, 메뉴, 결제, 배달앱 설정을 관리합니다."}
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex flex-wrap gap-1 bg-muted/50 p-1">
            <TabsTrigger value="tables" className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <LayoutGrid className="h-3.5 w-3.5" />
              {t("posScreenConfigTabTables") || "테이블 구성"}
            </TabsTrigger>
            <TabsTrigger value="menus" className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Monitor className="h-3.5 w-3.5" />
              {t("posScreenConfigTabMenus") || "메뉴 화면 구성"}
            </TabsTrigger>
            <TabsTrigger value="cook-timer" className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <TimerReset className="h-3.5 w-3.5" />
              {t("posScreenConfigTabCookTimer") || "조리시간/색상"}
            </TabsTrigger>
            <TabsTrigger value="payment" className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <CreditCard className="h-3.5 w-3.5" />
              {t("posScreenConfigTabPayment") || "결제 관리"}
            </TabsTrigger>
            <TabsTrigger value="delivery" className="gap-1.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Truck className="h-3.5 w-3.5" />
              {t("posScreenConfigTabDelivery") || "배달앱 관리"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tables" className="mt-0">
            <div className="rounded-xl border bg-card p-6">
              <h3 className="text-sm font-bold mb-4">{t("posTableLayout") || "테이블 배치"}</h3>
              <p className="text-xs text-muted-foreground mb-4">{t("posTableLayoutSub") || "매장별 테이블 위치를 드래그하여 배치합니다."}</p>
              <PosTableLayoutContent />
            </div>
          </TabsContent>

          <TabsContent value="menus" className="mt-0">
            <div className="rounded-xl border bg-card p-3 min-h-[640px]">
              <Tabs value={menusSubTab} onValueChange={(v) => setMenusSubTab(v as "menu-screen" | "menu-board")} className="space-y-3">
                <TabsList className="h-9">
                  <TabsTrigger value="menu-screen" className="text-xs">{t("posScreenConfigTabMenus") || "메뉴 화면 구성"}</TabsTrigger>
                  <TabsTrigger value="menu-board" className="text-xs">{t("posMenuTabMenuBoard") || "메뉴판 관리"}</TabsTrigger>
                </TabsList>
                <TabsContent value="menu-screen" className="mt-0">
                  <PosTerminalMenuScreen
                    mode="admin-config"
                    storeCode={auth?.store || null}
                    selectedTableName={t("posScreenConfigTabMenus") || "메뉴 화면 구성"}
                    onBack={() => setActiveTab("tables")}
                    backButtonLabel={t("posScreenConfigTabTables") || "테이블 구성"}
                  />
                </TabsContent>
                <TabsContent value="menu-board" className="mt-0">
                  <PosMenuBoardManagementContent storeCode={auth?.store || null} />
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>

          <TabsContent value="cook-timer" className="mt-0">
            <div className="rounded-xl border bg-card p-6">
              <h3 className="text-sm font-bold mb-2">{t("posScreenConfigTabCookTimer") || "조리시간/색상"}</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {t("posScreenConfigTabCookTimerDesc") || "테이블 색상 전환 시간 및 레시피 대비 색상 기준을 설정합니다."}
              </p>
              <PosCookingRulesContent />
            </div>
          </TabsContent>

          <TabsContent value="payment" className="mt-0">
            <div className="rounded-xl border bg-card p-6">
              <h3 className="text-sm font-bold mb-2">{t("posScreenConfigTabPayment") || "결제 관리"}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("posScreenConfigTabPaymentDesc") || "결산 시 사용할 카드·QR 수단 breakdown 키를 설정합니다."}
              </p>
              <PosPaymentSettingsContent />
            </div>
          </TabsContent>

          <TabsContent value="delivery" className="mt-0">
            <div className="rounded-xl border bg-card p-6">
              <h3 className="text-sm font-bold mb-2">{t("posScreenConfigTabDelivery") || "배달앱 관리"}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("posScreenConfigTabDeliveryDesc") || "배달앱 추가·수정·순서 변경, dine out 지원 여부를 설정합니다."}
              </p>
              <PosDeliveryAppsContent />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
