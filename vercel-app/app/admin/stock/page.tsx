"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert } from "@/lib/app-message"

import * as React from "react"
import { BarChart3 } from "lucide-react"
import { StockTable } from "@/components/erp/stock-table"
import { StockAdjustDialog } from "@/components/erp/stock-adjust-dialog"
import { StockAdjustmentHistory } from "@/components/erp/stock-adjustment-history"
import { StockReorderAssist } from "@/components/erp/stock-reorder-assist"
import { StockDailyMatrixPanel } from "@/components/erp/stock-daily-matrix-panel"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import { isManagerOrFranchiseeRole, isOfficeRole, canToggleItemOrderDisabled } from "@/lib/permissions"
import {
  useStoreList,
  getAppData,
  adjustStock,
  saveSafetyStock,
  updateItemOrderDisabled,
  type StockStatusItem,
} from "@/lib/api-client"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { dedupeOfficeStoreOptions, isOfficeStoreVariant } from "@/lib/office-store-canonical"
import { collectCategoryOptions } from "@/lib/stock-history-filter"
import { useItemCategoryOptions } from "@/lib/use-item-category-options"
import {
  clearStockStatusViewCache,
  readStockStatusViewCache,
  saveStockStatusViewCache,
} from "@/lib/stock-status-view-cache"
import { useErpAllowUrlSync, useErpPageActiveRef } from "@/lib/erp-page-visibility"

/** 본사/오피스/본점/CM Office 등 → CM Office 로 통일 (중복 제거) */
function normalizeStoreList(stores: string[]): string[] {
  return dedupeOfficeStoreOptions(stores)
}

export default function StockPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const { posStores: rawStores } = useStoreList()
  const stores = React.useMemo(() => normalizeStoreList(rawStores || []), [rawStores])
  const [list, setList] = React.useState<StockStatusItem[]>([])
  const [loading, setLoading] = React.useState(false)
  const [storeFilter, setStoreFilter] = React.useState("")
  const [stockDateFilter, setStockDateFilter] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("")
  const [purchaseSourceFilter, setPurchaseSourceFilter] = React.useState<"" | "hq" | "store">("")
  const [searchTerm, setSearchTerm] = React.useState("")
  const [adjustItem, setAdjustItem] = React.useState<StockStatusItem | null>(null)
  const [adjustOpen, setAdjustOpen] = React.useState(false)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [activeTab, setActiveTab] = React.useState("list")
  const allowStockUrlSync = useErpAllowUrlSync("/admin/stock")
  const pageActiveRef = useErpPageActiveRef()
  const viewCacheRestoredRef = React.useRef(false)
  const lastFetchedRef = React.useRef<{
    storeFilter: string
    stockDateFilter: string
    list: StockStatusItem[]
  } | null>(null)

  const isManager = React.useMemo(() => isManagerOrFranchiseeRole(auth?.role || ""), [auth?.role])
  const userStore = (auth?.store || "").trim()

  const canAdjust = React.useMemo(() => {
    return isOfficeRole(auth?.role || "") || (isManager && !!userStore)
  }, [auth?.role, isManager, userStore])

  /** 발주 일시중지 토글 — 본사(Office) 또는 물류 */
  const canToggleOrderPaused = React.useMemo(
    () => canToggleItemOrderDisabled(auth?.role || ""),
    [auth?.role]
  )

  const isOffice = React.useMemo(() => isOfficeRole(auth?.role || ""), [auth?.role])

  const matrixStoreTargets = React.useMemo(() => {
    return stores.filter((s) => !isOfficeStoreVariant(s))
  }, [stores])

  const storesForFilter = React.useMemo(() => {
    if (isManager && userStore) return [userStore]
    return stores
  }, [isManager, userStore, stores])

  const storeSelectDisabled = isManager && !!userStore

  const masterCategories = useItemCategoryOptions()
  const categoryOptions = React.useMemo(
    () =>
      collectCategoryOptions(
        list.map((r) => ({ item: r.name, itemCode: r.code, category: r.category })),
        masterCategories
      ),
    [list, masterCategories]
  )

  const fetchStock = React.useCallback(async () => {
    const store = storeFilter.trim()
    if (!store) {
      setList([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const asOfDate = stockDateFilter.trim() || undefined
      const { items, stock } = await getAppData(store, asOfDate)
      const mapped: StockStatusItem[] = items.map((i) => ({
        code: i.code,
        name: i.name,
        image: i.image,
        spec: i.spec,
        qty: stock[i.code] ?? 0,
        safeQty: i.safeQty ?? 0,
        store,
        price: i.price ?? 0,
        cost: i.cost ?? i.price ?? 0,
        category: i.category,
        purchaseSource: i.purchaseSource ?? 'hq',
        orderDisabled: i.orderDisabled === true,
        stockBaseUnit: i.stockBaseUnit,
        stockUnitOptions: i.stockUnitOptions,
        standardUnits: i.standardUnits,
      }))
      setList(mapped)
      setHasSearched(true)
      lastFetchedRef.current = {
        storeFilter: store,
        stockDateFilter: stockDateFilter.trim(),
        list: mapped,
      }
    } catch {
      setList([])
      setHasSearched(true)
      lastFetchedRef.current = {
        storeFilter: store,
        stockDateFilter: stockDateFilter.trim(),
        list: [],
      }
    } finally {
      setLoading(false)
    }
  }, [storeFilter, stockDateFilter])

  React.useEffect(() => {
    if (viewCacheRestoredRef.current) return
    if (!pageActiveRef.current || !allowStockUrlSync) return
    viewCacheRestoredRef.current = true
    const snap = readStockStatusViewCache()
    if (snap?.hasSearched) {
      setStoreFilter(snap.storeFilter || "")
      setStockDateFilter(snap.stockDateFilter || getBangkokTodayDateString())
      setCategoryFilter(snap.categoryFilter || "")
      setPurchaseSourceFilter(snap.purchaseSourceFilter || "")
      setSearchTerm(snap.searchTerm || "")
      setList(snap.list || [])
      setHasSearched(true)
      lastFetchedRef.current = {
        storeFilter: snap.storeFilter || "",
        stockDateFilter: snap.stockDateFilter || "",
        list: snap.list || [],
      }
      if (snap.activeTab) setActiveTab(snap.activeTab)
      return
    }
    setStockDateFilter(getBangkokTodayDateString())
  }, [allowStockUrlSync, pageActiveRef])

  React.useEffect(() => {
    if (isManager && userStore) {
      setStoreFilter(userStore)
    }
  }, [isManager, userStore])

  React.useEffect(() => {
    if (!hasSearched) {
      lastFetchedRef.current = null
      clearStockStatusViewCache()
      return
    }
    const fetched = lastFetchedRef.current
    if (!fetched) return
    const sameQuery =
      fetched.storeFilter === storeFilter.trim() &&
      fetched.stockDateFilter === stockDateFilter.trim()
    const listToSave = sameQuery ? list : fetched.list
    if (sameQuery) {
      lastFetchedRef.current = { ...fetched, list: listToSave }
    }
    saveStockStatusViewCache({
      storeFilter: sameQuery ? storeFilter.trim() : fetched.storeFilter,
      stockDateFilter: sameQuery ? stockDateFilter.trim() : fetched.stockDateFilter,
      categoryFilter,
      purchaseSourceFilter,
      searchTerm,
      list: listToSave,
      hasSearched: true,
      activeTab,
    })
  }, [
    activeTab,
    categoryFilter,
    hasSearched,
    list,
    purchaseSourceFilter,
    searchTerm,
    stockDateFilter,
    storeFilter,
  ])

  const handleAdjust = (item: StockStatusItem) => {
    setAdjustItem(item)
    setAdjustOpen(true)
  }

  const handleSaveSafeQty = async (item: StockStatusItem, newSafeQty: number) => {
    const res = await saveSafetyStock({
      store: item.store,
      code: item.code,
      qty: newSafeQty,
    })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      return
    }
    await appAlert(t("stockSafeSaveSuccess"))
    fetchStock()
  }

  const handleAdjustConfirm = async (diffQty: number, memo?: string) => {
    if (!adjustItem) return
    const res = await adjustStock({
      store: adjustItem.store,
      itemCode: adjustItem.code,
      itemName: adjustItem.name,
      spec: adjustItem.spec,
      diffQty,
      memo,
      userRole: auth?.role,
      asOfDate: stockDateFilter.trim() || undefined,
    })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("stockAdjustFailed"))
      return
    }
    await appAlert(t("stockAdjustSuccess"))
    // 조정한 항목만 로컬 업데이트 (전체 refetch 없음 → 스크롤 위치 유지)
    setList((prev) =>
      prev.map((r) =>
        r.code === adjustItem.code && r.store === adjustItem.store
          ? { ...r, qty: r.qty + diffQty }
          : r
      )
    )
    setAdjustOpen(false)
    setAdjustItem(null)
  }

  const handleToggleOrderDisabled = async (item: StockStatusItem) => {
    const nextDisabled = !item.orderDisabled
    const res = await updateItemOrderDisabled({ code: item.code, disabled: nextDisabled })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      return
    }
    setList((prev) =>
      prev.map((r) => (r.code === item.code ? { ...r, orderDisabled: nextDisabled } : r))
    )
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BarChart3 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              {t("stockPageTitle")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t("stockPageSub")}
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="list" className={adminTabsTriggerCn}>
                  {t("stockTabList")}
                </TabsTrigger>
                <TabsTrigger value="reorder" className={adminTabsTriggerCn}>
                  {t("stockTabReorder")}
                </TabsTrigger>
                <TabsTrigger value="history" className={adminTabsTriggerCn}>
                  {t("stockTabHistory")}
                </TabsTrigger>
                {isOffice && (
                  <TabsTrigger value="dailyMatrix" className={adminTabsTriggerCn}>
                    {t("stockTabDailyMatrix")}
                  </TabsTrigger>
                )}
              </TabsList>
          </AdminTabsBarWithHelp>
          <TabsContent value="list" className={adminTabsContentCn}>
            <StockTable
              list={list}
              stores={storesForFilter}
              loading={loading}
              storeFilter={storeFilter}
              setStoreFilter={setStoreFilter}
              storeSelectDisabled={storeSelectDisabled}
              stockDateFilter={stockDateFilter}
              setStockDateFilter={setStockDateFilter}
              categoryFilter={categoryFilter}
              setCategoryFilter={setCategoryFilter}
              categoryOptions={categoryOptions}
              purchaseSourceFilter={purchaseSourceFilter}
              setPurchaseSourceFilter={setPurchaseSourceFilter}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onSearch={fetchStock}
              canAdjust={canAdjust}
              onAdjust={handleAdjust}
              onSaveSafeQty={handleSaveSafeQty}
              onToggleOrderDisabled={canToggleOrderPaused ? handleToggleOrderDisabled : undefined}
            />
          </TabsContent>
          <TabsContent value="reorder" className={adminTabsContentCn}>
            <StockReorderAssist
              stores={storesForFilter}
              storeFilter={storeFilter}
              setStoreFilter={setStoreFilter}
              storeSelectDisabled={storeSelectDisabled}
              stockDateFilter={stockDateFilter}
              setStockDateFilter={setStockDateFilter}
              userRole={auth?.role || ""}
            />
          </TabsContent>
          <TabsContent value="history" className={adminTabsContentCn}>
            <StockAdjustmentHistory isManager={isManager} userStore={userStore} />
          </TabsContent>
          {isOffice && (
            <TabsContent value="dailyMatrix" className={adminTabsContentCn}>
              <StockDailyMatrixPanel storeTargets={matrixStoreTargets} />
            </TabsContent>
          )}
        </Tabs>
      </div>

      <StockAdjustDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        item={adjustItem}
        asOfDate={stockDateFilter.trim() || undefined}
        onConfirm={handleAdjustConfirm}
      />
    </div>
  )
}
