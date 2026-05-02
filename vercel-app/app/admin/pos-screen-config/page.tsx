"use client"


import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import * as React from "react"
import { useSearchParams } from "next/navigation"
import { LayoutGrid, Monitor, CreditCard, Truck, TimerReset, Smartphone, Save } from "lucide-react"
import {
  adminTabsBarCn,
  adminTabsContentFlushCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PosTableLayoutContent } from "@/components/pos/pos-table-layout-content"
import { PosCookingRulesContent } from "@/components/pos/pos-cooking-rules-content"
import { PosDeliveryAppsContent } from "@/components/pos/pos-delivery-apps-content"
import { PosPaymentSettingsContent } from "@/components/pos/pos-payment-settings-content"
import { PosTerminalMenuScreen } from "@/components/pos/pos-terminal-menu-screen"
import { PosMenuBoardManagementContent } from "@/components/pos/pos-menu-board-management-content"
import { PosTerminalSettingsContent } from "@/components/pos/pos-terminal-settings-content"
import {
  PosCustomerDisplayContentSettings,
  type PosCustomerDisplayContentSettingsHandle,
} from "@/components/pos/pos-customer-display-content-settings"
import { PosScreenConfigStoreAndCopyRow } from "@/components/pos/pos-screen-config-store-and-copy-row"
import { PosScreenConfigEmeraldSaveButton } from "@/components/pos/pos-screen-config-action-bar"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import { useStoreList } from "@/lib/api-client"
import { isOfficeRole } from "@/lib/permissions"


export default function PosScreenConfigPage() {
  const searchParams = useSearchParams()
  const { auth } = useAuth()
  const { stores } = useStoreList()
  const { lang } = useLang()
  const t = useT(lang)
  const tr = React.useCallback(
    (key: string, fallback: string) => {
      const v = t(key)
      return v && v !== key ? v : fallback
    },
    [t]
  )
  const canPickStore = isOfficeRole(auth?.role || "")
  const [pickedStore, setPickedStore] = React.useState("")
  const effectiveStoreForMenuAndDisplay = String(
    canPickStore && pickedStore ? pickedStore : auth?.store || ""
  ).trim()

  React.useEffect(() => {
    if (canPickStore && stores.length && !pickedStore) {
      setPickedStore(stores[0])
    } else if (!canPickStore && auth?.store) {
      setPickedStore(auth.store)
    }
  }, [canPickStore, stores, auth?.store, pickedStore])

  const tabParam = searchParams.get("tab") || "tables"
  const [activeTab, setActiveTab] = React.useState(
    ["tables", "cook-timer", "menus", "payment", "delivery", "terminal", "dual-monitor"].includes(tabParam) ? tabParam : "tables"
  )
  const [menusSubTab, setMenusSubTab] = React.useState<"menu-screen" | "menu-board">("menu-screen")
  const [menuConfigReloadNonce, setMenuConfigReloadNonce] = React.useState(0)
  const customerDisplayRef = React.useRef<PosCustomerDisplayContentSettingsHandle>(null)
  const [customerToolbarSaving, setCustomerToolbarSaving] = React.useState(false)

  React.useEffect(() => {
    const tab = searchParams.get("tab")
    if (tab && ["tables", "cook-timer", "menus", "payment", "delivery", "terminal", "dual-monitor"].includes(tab)) setActiveTab(tab)
  }, [searchParams])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Monitor className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("posScreenConfig") || "POS 설정"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("posScreenConfigSub") || "테이블, 메뉴, 결제, 배달앱, 단말 설정을 관리합니다."}
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="tables" className={adminTabsTriggerCn}>
                  <LayoutGrid className={adminTabsIconCn} aria-hidden />
                  {t("posScreenConfigTabTables") || "테이블 구성"}
                </TabsTrigger>
                <TabsTrigger value="menus" className={adminTabsTriggerCn}>
                  <Monitor className={adminTabsIconCn} aria-hidden />
                  {t("posScreenConfigTabMenus") || "메뉴 화면 구성"}
                </TabsTrigger>
                <TabsTrigger value="cook-timer" className={adminTabsTriggerCn}>
                  <TimerReset className={adminTabsIconCn} aria-hidden />
                  {t("posScreenConfigTabCookTimer") || "조리시간/색상"}
                </TabsTrigger>
                <TabsTrigger value="payment" className={adminTabsTriggerCn}>
                  <CreditCard className={adminTabsIconCn} aria-hidden />
                  {t("posScreenConfigTabPayment") || "결제 관리"}
                </TabsTrigger>
                <TabsTrigger value="delivery" className={adminTabsTriggerCn}>
                  <Truck className={adminTabsIconCn} aria-hidden />
                  {t("posScreenConfigTabDelivery") || "배달앱 관리"}
                </TabsTrigger>
                <TabsTrigger value="terminal" className={adminTabsTriggerCn}>
                  <Smartphone className={adminTabsIconCn} aria-hidden />
                  {t("posScreenConfigTabTerminal") || "단말 설정"}
                </TabsTrigger>
                <TabsTrigger value="dual-monitor" className={adminTabsTriggerCn}>
                  <Monitor className={adminTabsIconCn} aria-hidden />
                  {t("posDualMonitorTab") || "듀얼 모니터"}
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>

          <TabsContent value="tables" className={adminTabsContentFlushCn}>
            <div className="rounded-xl border bg-card p-6">
              <h3 className="text-sm font-bold mb-4">{t("posTableLayout") || "테이블 배치"}</h3>
              <p className="text-xs text-muted-foreground mb-4">{t("posTableLayoutSub") || "매장별 테이블 위치를 드래그하여 배치합니다."}</p>
              <PosTableLayoutContent />
            </div>
          </TabsContent>

          <TabsContent value="menus" className={adminTabsContentFlushCn}>
            <div className="min-h-[640px] rounded-xl border bg-card p-6">
              <Tabs value={menusSubTab} onValueChange={(v) => setMenusSubTab(v as "menu-screen" | "menu-board")} className="space-y-4">
                <div className={adminTabsBarCn}>
                  <div className={adminTabsScrollCn}>
                    <TabsList className={adminTabsListRowCn}>
                      <TabsTrigger value="menu-screen" className={adminTabsTriggerCn}>
                        {t("posScreenConfigTabMenus") || "메뉴 화면 구성"}
                      </TabsTrigger>
                      <TabsTrigger value="menu-board" className={adminTabsTriggerCn}>
                        {t("posMenuTabMenuBoard") || "메뉴판 관리"}
                      </TabsTrigger>
                    </TabsList>
                  </div>
                </div>
                <TabsContent value="menu-screen" className="mt-0 flex min-h-0 flex-col gap-4 overflow-hidden">
                  <PosScreenConfigStoreAndCopyRow
                    canPickStore={canPickStore}
                    stores={stores}
                    pickedStore={pickedStore}
                    onPickedStoreChange={setPickedStore}
                    readOnlyStoreCode={auth?.store}
                    effectiveStore={effectiveStoreForMenuAndDisplay}
                    showCopy
                    copyVariant="menu"
                    tr={tr}
                    onRefresh={() => setMenuConfigReloadNonce((n) => n + 1)}
                  />
                  <div
                    className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-lg border border-border"
                    style={{ height: "calc(100vh - 16rem)" }}
                  >
                    <PosTerminalMenuScreen
                      mode="admin-config"
                      storeCode={effectiveStoreForMenuAndDisplay || null}
                      configReloadNonce={menuConfigReloadNonce}
                      selectedTableName={t("posScreenConfigTabMenus") || "메뉴 화면 구성"}
                      onBack={() => setActiveTab("tables")}
                      backButtonLabel={t("posScreenConfigTabTables") || "테이블 구성"}
                      className="h-full min-h-0 flex-1"
                    />
                  </div>
                </TabsContent>
                <TabsContent value="menu-board" className="mt-0 space-y-4">
                  <PosScreenConfigStoreAndCopyRow
                    canPickStore={canPickStore}
                    stores={stores}
                    pickedStore={pickedStore}
                    onPickedStoreChange={setPickedStore}
                    readOnlyStoreCode={auth?.store}
                    effectiveStore={effectiveStoreForMenuAndDisplay}
                    showCopy={false}
                    copyVariant="menu"
                    tr={tr}
                  />
                  <PosMenuBoardManagementContent storeCode={effectiveStoreForMenuAndDisplay || null} />
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>

          <TabsContent value="cook-timer" className={adminTabsContentFlushCn}>
            <div className="rounded-xl border bg-card p-6">
              <h3 className="text-sm font-bold mb-2">{t("posScreenConfigTabCookTimer") || "조리시간/색상"}</h3>
              <p className="text-xs text-muted-foreground mb-4">
                {t("posScreenConfigTabCookTimerDesc") || "테이블 색상 전환 시간 및 레시피 대비 색상 기준을 설정합니다."}
              </p>
              <PosCookingRulesContent />
            </div>
          </TabsContent>

          <TabsContent value="payment" className={adminTabsContentFlushCn}>
            <div className="rounded-xl border bg-card p-6">
              <h3 className="text-sm font-bold mb-2">{t("posScreenConfigTabPayment") || "결제 관리"}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("posScreenConfigTabPaymentDesc") ||
                  "POS 결제 화면의 기타·QR 세부 수단과 결산 breakdown에 쓰일 항목을 매장별로 관리합니다."}
              </p>
              <PosPaymentSettingsContent />
            </div>
          </TabsContent>

          <TabsContent value="delivery" className={adminTabsContentFlushCn}>
            <div className="rounded-xl border bg-card p-6">
              <h3 className="text-sm font-bold mb-2">{t("posScreenConfigTabDelivery") || "배달앱 관리"}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("posScreenConfigTabDeliveryDesc") || "배달앱 추가·수정·순서 변경, 매장결제 노출 여부를 설정합니다."}
              </p>
              <PosDeliveryAppsContent />
            </div>
          </TabsContent>

          <TabsContent value="terminal" className={adminTabsContentFlushCn}>
            <div className="rounded-xl border bg-card p-6">
              <h3 className="text-sm font-bold mb-2">{t("posScreenConfigTabTerminal") || "단말 설정"}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("posScreenConfigTabTerminalDesc") || "메인 포스(프린터 연결) 1대 지정. 주문 단말은 인쇄 없이 주문만 입력합니다."}
              </p>
              <PosTerminalSettingsContent />
            </div>
          </TabsContent>

          <TabsContent value="dual-monitor" className={adminTabsContentFlushCn}>
            <div className="rounded-xl border bg-card p-6">
              <h3 className="mb-2 text-sm font-bold">{t("posDualMonitorTab") || "듀얼 모니터"}</h3>
              <p className="mb-4 text-sm text-muted-foreground">
                {t("posDualMonitorTabDesc") || "고객용 화면의 평상시/주문중/결제중/QR 표시 콘텐츠를 설정합니다."}
              </p>
              <div className="space-y-4">
                <PosScreenConfigStoreAndCopyRow
                  canPickStore={canPickStore}
                  stores={stores}
                  pickedStore={pickedStore}
                  onPickedStoreChange={setPickedStore}
                  readOnlyStoreCode={auth?.store}
                  effectiveStore={effectiveStoreForMenuAndDisplay}
                  showCopy
                  copyVariant="display"
                  tr={tr}
                  onRefresh={() => void customerDisplayRef.current?.reload()}
                  refreshLoading={false}
                  rightSlot={
                    <PosScreenConfigEmeraldSaveButton
                      disabled={!effectiveStoreForMenuAndDisplay || customerToolbarSaving}
                      onClick={() => {
                        void (async () => {
                          setCustomerToolbarSaving(true)
                          try {
                            await customerDisplayRef.current?.save()
                          } finally {
                            setCustomerToolbarSaving(false)
                          }
                        })()
                      }}
                    >
                      <Save className="h-4 w-4" />
                      {customerToolbarSaving ? t("posPrinterSaving") : t("itemsBtnSave") || "저장"}
                    </PosScreenConfigEmeraldSaveButton>
                  }
                />
                <PosCustomerDisplayContentSettings
                  ref={customerDisplayRef}
                  toolbarMode="embedded"
                  storeCode={effectiveStoreForMenuAndDisplay || null}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
