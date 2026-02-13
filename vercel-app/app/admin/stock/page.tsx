"use client"

import * as React from "react"
import { BarChart3 } from "lucide-react"
import { StockTable } from "@/components/erp/stock-table"
import { StockAdjustDialog } from "@/components/erp/stock-adjust-dialog"
import { StockAdjustmentHistory } from "@/components/erp/stock-adjustment-history"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import {
  getStockStores,
  getAppData,
  adjustStock,
  saveSafetyStock,
  type StockStatusItem,
} from "@/lib/api-client"

const OFFICE_ROLES = ["director", "officer", "ceo", "hr"]

export default function StockPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const { auth } = useAuth()
  const [stores, setStores] = React.useState<string[]>([])
  const [list, setList] = React.useState<StockStatusItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [storeFilter, setStoreFilter] = React.useState("")
  const [searchTerm, setSearchTerm] = React.useState("")
  const [adjustItem, setAdjustItem] = React.useState<StockStatusItem | null>(null)
  const [adjustOpen, setAdjustOpen] = React.useState(false)

  const canAdjust = React.useMemo(() => {
    const role = (auth?.role || "").toLowerCase()
    return OFFICE_ROLES.some((r) => role.includes(r))
  }, [auth?.role])

  const fetchStores = React.useCallback(async () => {
    try {
      const s = await getStockStores()
      setStores(s || [])
    } catch {
      setStores([])
    }
  }, [])

  const fetchStock = React.useCallback(async () => {
    const store = storeFilter.trim()
    if (!store) {
      setList([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { items, stock } = await getAppData(store)
      const mapped: StockStatusItem[] = items.map((i) => ({
        code: i.code,
        name: i.name,
        spec: i.spec,
        qty: stock[i.code] ?? 0,
        safeQty: i.safeQty ?? 0,
        store,
        price: i.price ?? 0,
        cost: i.cost ?? i.price ?? 0,
      }))
      setList(mapped)
    } catch {
      setList([])
    } finally {
      setLoading(false)
    }
  }, [storeFilter])

  React.useEffect(() => {
    fetchStores()
  }, [fetchStores])

  React.useEffect(() => {
    fetchStock()
  }, [fetchStock])

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
      alert(res.message || "저장 실패")
      return
    }
    alert(t("stockSafeSaveSuccess"))
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
    })
    if (!res.success) {
      alert(res.message || t("stockAdjustFailed"))
      return
    }
    alert(t("stockAdjustSuccess"))
    fetchStock()
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

        <Tabs defaultValue="list" className="space-y-4">
          <TabsList>
            <TabsTrigger value="list">{t("stockTabList")}</TabsTrigger>
            <TabsTrigger value="history">{t("stockTabHistory")}</TabsTrigger>
          </TabsList>
          <TabsContent value="list">
            <StockTable
              list={list}
              stores={stores}
              loading={loading}
              storeFilter={storeFilter}
              setStoreFilter={setStoreFilter}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onSearch={fetchStock}
              canAdjust={canAdjust}
              onAdjust={handleAdjust}
              onSaveSafeQty={handleSaveSafeQty}
            />
          </TabsContent>
          <TabsContent value="history">
            <StockAdjustmentHistory />
          </TabsContent>
        </Tabs>
      </div>

      <StockAdjustDialog
        open={adjustOpen}
        onOpenChange={setAdjustOpen}
        item={adjustItem}
        onConfirm={handleAdjustConfirm}
      />
    </div>
  )
}
