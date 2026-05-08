"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Tags, Settings, FileSpreadsheet, History } from "lucide-react"
import { Button } from "@/components/ui/button"
import * as XLSX from "xlsx"
import { ItemForm, type ItemFormData } from "@/components/erp/item-form"
import { ItemTable } from "@/components/erp/item-table"
import { OutboundLocationSettingsDialog } from "@/components/erp/outbound-location-settings-dialog"
import { ItemCategorySettingsDialog } from "@/components/erp/item-category-settings-dialog"
import { PriceHistoryTab } from "@/components/erp/price-history-tab"
import { PriceScheduleTab } from "@/components/erp/price-schedule-tab"
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsIconCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { getAdminItems, getItemCategories, getWarehouseLocations, saveItem, deleteItem, updateItemOrderDisabled, importItemsFromExcel, type AdminItem } from "@/lib/api-client"
import { compareByCode } from "@/lib/sort-utils"
import { useAuth } from "@/lib/auth-context"
import { canToggleItemOrderDisabled } from "@/lib/permissions"
import { isOfficeRole } from "@/lib/permissions"

export type Product = AdminItem

const emptyForm: ItemFormData = {
  code: "",
  category: "",
  vendor: "",
  outboundLocation: "",
  name: "",
  imageUrl: "",
  taxType: "taxable",
  spec: "",
  unit: "",
  totalQuantity: "",
  description: "",
  price: "",
  priceInputVatIncluded: false,
  cost: "",
  costInputVatIncluded: false,
  purchaseSource: "hq",
  stockBaseUnit: "",
  stockUnitOptions: [],
  standardUnits: [],
  accountSubjectId: "",
}

export default function ItemsPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const searchParams = useSearchParams()
  const router = useRouter()
  const { auth } = useAuth()
  const canToggleOrderPaused = React.useMemo(() => canToggleItemOrderDisabled(auth?.role || ""), [auth?.role])
  const [products, setProducts] = React.useState<Product[]>([])
  const [allCategories, setAllCategories] = React.useState<string[]>([])
  const [loading, setLoading] = React.useState(true)
  const [formData, setFormData] = React.useState<ItemFormData>(emptyForm)
  const [editingCode, setEditingCode] = React.useState<string | null>(null)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("all")
  const [outboundFilter, setOutboundFilter] = React.useState("all")
  const [outboundLocations, setOutboundLocations] = React.useState<{ location_code: string; name: string }[]>([])
  const [outboundSettingsOpen, setOutboundSettingsOpen] = React.useState(false)
  const [categorySettingsOpen, setCategorySettingsOpen] = React.useState(false)
  const [excelImporting, setExcelImporting] = React.useState(false)
  const [itemsTab, setItemsTab] = React.useState<"list" | "priceHistory">("list")
  const [priceManageTab, setPriceManageTab] = React.useState<"history" | "schedule">("history")
  const excelInputRef = React.useRef<HTMLInputElement>(null)

  const loadOutboundLocations = React.useCallback(async () => {
    try {
      const locs = await getWarehouseLocations()
      setOutboundLocations((locs || []).map((l) => ({ location_code: l.location_code, name: l.name })))
    } catch {
      setOutboundLocations([])
    }
  }, [])

  React.useEffect(() => {
    Promise.all([getAdminItems(), getItemCategories(), getWarehouseLocations()])
      .then(([list, { categories }, locs]) => {
        setProducts(list || [])
        setAllCategories(categories || [])
        setOutboundLocations((locs || []).map((l) => ({ location_code: l.location_code, name: l.name })))
      })
      .catch(() => {
        setProducts([])
        setAllCategories([])
        setOutboundLocations([])
      })
      .finally(() => setLoading(false))
  }, [])

  const prefillAppliedKey = React.useRef<string | null>(null)
  React.useEffect(() => {
    const qs = searchParams.toString()
    if (!qs.includes("prefillFromSauce=1")) {
      prefillAppliedKey.current = null
      return
    }
    if (prefillAppliedKey.current === qs) return
    prefillAppliedKey.current = qs

    const name = (searchParams.get("name") || "").trim()
    const unit = (searchParams.get("unit") || "g").trim() || "g"
    const totalQtyRaw = parseFloat(searchParams.get("totalQty") || "")
    const totalQty = Number.isFinite(totalQtyRaw) && totalQtyRaw > 0 ? totalQtyRaw : 1000
    const batchRaw = parseFloat(searchParams.get("batchCost") || "")
    const batchCost = Number.isFinite(batchRaw) && batchRaw >= 0 ? Math.round(batchRaw * 100) / 100 : 0
    const sauceCode = (searchParams.get("sauceCode") || "").trim()

    setItemsTab("list")
    setEditingCode(null)
    setFormData({
      ...emptyForm,
      name,
      unit,
      totalQuantity: String(totalQty),
      standardUnits: [{ unit, totalQuantity: totalQty }],
      cost: batchCost > 0 ? String(batchCost) : "",
      price: "",
      description: sauceCode ? `${t("itemsPrefillFromSauceNote") || "배합 연동"}: ${sauceCode}` : "",
    })

    router.replace("/admin/items", { scroll: false })
  }, [searchParams, router, t])

  const handleNewRegister = () => {
    setFormData(emptyForm)
    setEditingCode(null)
  }

  const handleReset = () => {
    if (editingCode) {
      const p = products.find((x) => x.code === editingCode)
      if (p) {
        const derivedStandardUnits = (() => {
          const su = Array.isArray(p.standardUnits) ? p.standardUnits : []
          if (su.length > 0) return su
          const u = p.unit ?? ""
          const tq = p.totalQuantity != null ? Number(p.totalQuantity) : 0
          if (u || tq > 0) return [{ unit: u, totalQuantity: tq > 0 ? tq : 1 }]
          return []
        })()
        const firstRow = derivedStandardUnits[0]
        setFormData({
          code: p.code,
          category: p.category,
          vendor: p.vendor,
          outboundLocation: p.outboundLocation ?? "",
          name: p.name,
          imageUrl: p.imageUrl,
          taxType: p.taxType,
          spec: p.spec,
          unit: firstRow ? firstRow.unit : (p.unit ?? ""),
          totalQuantity: firstRow ? String(firstRow.totalQuantity) : (p.totalQuantity != null ? String(p.totalQuantity) : ""),
          description: p.description ?? "",
          price: String(p.price),
          priceInputVatIncluded: false,
          cost: String(p.cost),
          costInputVatIncluded: false,
          purchaseSource: p.purchaseSource ?? "hq",
          stockBaseUnit: p.stockBaseUnit ?? "",
          stockUnitOptions: Array.isArray(p.stockUnitOptions) ? p.stockUnitOptions : [],
          standardUnits: derivedStandardUnits,
          accountSubjectId:
            p.accountSubjectId != null && Number.isFinite(Number(p.accountSubjectId))
              ? String(Number(p.accountSubjectId))
              : "",
        })
      }
    } else {
      setFormData(emptyForm)
    }
  }

  const handleSave = async () => {
    const code = formData.code.trim()
    const name = formData.name.trim()
    if (!code || !name) {
      await appAlert(t("itemsAlertCodeName"))
      return
    }
    if (!editingCode && products.some((p) => p.code === code)) {
      await appAlert(t("itemsAlertCodeExists"))
      return
    }
    const validStandardUnits = (formData.standardUnits || []).filter((o) => (o.unit || "").trim() && o.totalQuantity > 0)
    const firstRow = validStandardUnits[0]
    const unitForSave = firstRow ? firstRow.unit.trim() : formData.unit.trim()
    const totalQty = firstRow ? firstRow.totalQuantity : (formData.totalQuantity.trim() ? parseFloat(formData.totalQuantity) : null)
    const rawPrice = Number(formData.price) || 0
    const priceToSave = formData.taxType === "taxable" && formData.priceInputVatIncluded
      ? Math.round((rawPrice / 1.07) * 100) / 100
      : rawPrice
    const rawCost = Number(formData.cost) || 0
    const costToSave = formData.taxType === "taxable" && formData.costInputVatIncluded
      ? Math.round((rawCost / 1.07) * 100) / 100
      : rawCost
    const res = await saveItem({
      code,
      name,
      category: formData.category.trim(),
      vendor: formData.vendor.trim(),
      outboundLocation: formData.outboundLocation.trim(),
      spec: formData.spec.trim(),
      unit: unitForSave,
      totalQuantity: totalQty != null && totalQty > 0 ? totalQty : null,
      description: formData.description.trim(),
      price: priceToSave,
      cost: costToSave,
      taxType: formData.taxType,
      imageUrl: formData.imageUrl.trim(),
      editingCode: editingCode || undefined,
      purchaseSource: formData.purchaseSource,
      stockBaseUnit: formData.stockBaseUnit.trim(),
      stockUnitOptions: formData.stockUnitOptions.filter((o) => (o.unit || "").trim()),
      standardUnits: validStandardUnits,
      accountSubjectId:
        formData.accountSubjectId && formData.accountSubjectId !== "__none__"
          ? Number(formData.accountSubjectId)
          : null,
    })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
      return
    }
    const newItem: Product = {
      code,
      name,
      category: formData.category.trim(),
      vendor: formData.vendor.trim(),
      outboundLocation: formData.outboundLocation.trim(),
      spec: formData.spec.trim(),
      unit: unitForSave,
      totalQuantity: totalQty != null && totalQty > 0 ? totalQty : null,
      description: formData.description.trim(),
      price: priceToSave,
      cost: costToSave,
      taxType: formData.taxType,
      imageUrl: formData.imageUrl.trim(),
      hasImage: !!formData.imageUrl.trim(),
      purchaseSource: formData.purchaseSource,
      orderDisabled: false,
      stockBaseUnit: formData.stockBaseUnit.trim(),
      stockUnitOptions: formData.stockUnitOptions.filter((o) => (o.unit || "").trim()),
      standardUnits: validStandardUnits,
      accountSubjectId:
        formData.accountSubjectId && formData.accountSubjectId !== "__none__"
          ? Number(formData.accountSubjectId)
          : null,
    }
    if (editingCode) {
      setProducts((prev) => prev.map((p) => (p.code === editingCode ? newItem : p)))
      await appAlert(t("itemsAlertUpdated"))
    } else {
      setProducts((prev) => [...prev, newItem])
      await appAlert(t("itemsAlertSaved"))
    }
    const newCat = formData.category.trim()
    if (newCat && !allCategories.includes(newCat)) {
      setAllCategories((prev) => [...prev, newCat].sort())
    }
    setFormData(emptyForm)
    setEditingCode(null)
  }

  const handleEdit = (product: Product) => {
    const derivedStandardUnits = (() => {
      const su = Array.isArray(product.standardUnits) ? product.standardUnits : []
      if (su.length > 0) return su
      const u = product.unit ?? ""
      const tq = product.totalQuantity != null ? Number(product.totalQuantity) : 0
      if (u || tq > 0) return [{ unit: u, totalQuantity: tq > 0 ? tq : 1 }]
      return []
    })()
    const firstRow = derivedStandardUnits[0]
    setFormData({
      code: product.code,
      category: product.category,
      vendor: product.vendor,
      outboundLocation: product.outboundLocation ?? "",
      name: product.name,
      imageUrl: product.imageUrl,
      taxType: product.taxType,
      spec: product.spec,
      unit: firstRow ? firstRow.unit : (product.unit ?? ""),
      totalQuantity: firstRow ? String(firstRow.totalQuantity) : (product.totalQuantity != null ? String(product.totalQuantity) : ""),
      description: product.description ?? "",
      price: String(product.price),
      cost: String(product.cost),
      purchaseSource: product.purchaseSource ?? "hq",
      stockBaseUnit: product.stockBaseUnit ?? "",
      stockUnitOptions: Array.isArray(product.stockUnitOptions) ? product.stockUnitOptions : [],
      standardUnits: derivedStandardUnits,
      accountSubjectId:
        product.accountSubjectId != null && Number.isFinite(Number(product.accountSubjectId))
          ? String(Number(product.accountSubjectId))
          : "",
    })
    setEditingCode(product.code)
  }

  const handleToggleOrderDisabled = async (product: Product) => {
    const nextDisabled = !product.orderDisabled
    const res = await updateItemOrderDisabled({ code: product.code, disabled: nextDisabled })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || res.message || t("msg_save_fail_detail"))
      return
    }
    setProducts((prev) =>
      prev.map((p) => (p.code === product.code ? { ...p, orderDisabled: nextDisabled } : p))
    )
  }

  const handleDelete = async (product: Product) => {
    if (!await appConfirm(`"${product.name}" ${t("itemsConfirmDelete")}`)) return
    const res = await deleteItem({ code: product.code })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("msg_delete_fail_detail"))
      return
    }
    setProducts((prev) => prev.filter((p) => p.code !== product.code))
    if (editingCode === product.code) {
      setFormData(emptyForm)
      setEditingCode(null)
    }
    await appAlert(t("itemsAlertDeleted"))
  }

  const handleSearch = () => {
    setHasSearched(true)
  }

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setExcelImporting(true)
    try {
      const res = await importItemsFromExcel(file)
      if (res.success) {
        await appAlert(res.message || (res.added ? `${res.added}건 등록` : '완료'))
        const [list] = await Promise.all([getAdminItems()])
        setProducts(list || [])
      } else {
        await appAlert(res.message || '가져오기 실패')
      }
    } catch (err) {
      await appAlert(err instanceof Error ? err.message : '오류')
    } finally {
      setExcelImporting(false)
    }
  }

  const handleExcelDownload = async () => {
    const source = products
    if (!source.length) {
      await appAlert(t("itemsNoResults") || "다운로드할 품목이 없습니다.")
      return
    }

    const rows = source.map((p) => {
      const taxLabel =
        p.taxType === "taxable"
          ? (t("taxable") || "과세")
          : p.taxType === "zero"
            ? (t("zeroTax") || "영세율")
            : (t("taxFree") || "면세")
      const stockUnitOptions = Array.isArray(p.stockUnitOptions) ? p.stockUnitOptions : []
      const standardUnits = Array.isArray(p.standardUnits) ? p.standardUnits : []
      const stock1 = stockUnitOptions[0]
      const stock2 = stockUnitOptions[1]
      const stock3 = stockUnitOptions[2]
      const std1 = standardUnits[0]
      const std2 = standardUnits[1]
      const std3 = standardUnits[2]
      return {
        [t("itemsColCode") || "코드"]: p.code,
        [t("itemsColName") || "품목명"]: p.name,
        [t("itemsCategory") || "카테고리"]: p.category || "",
        [t("itemsVendor") || "거래처"]: p.vendor || "",
        [t("outboundLocationSettings") || "출고지"]: p.outboundLocation || "",
        [t("itemsSpec") || "규격"]: p.spec || "",
        [t("itemsUnit") || "단위"]: p.unit || "",
        [t("itemsTotalQty") || "총수량"]: p.totalQuantity ?? "",
        [t("itemsTaxType") || "과세구분"]: taxLabel,
        [t("itemsPrice") || "판매가"]: p.price ?? 0,
        [t("itemsCost") || "원가"]: p.cost ?? 0,
        [t("itemsDesc") || "설명"]: p.description || "",
        [t("itemsOrderDisabled") || "발주 중지"]: p.orderDisabled ? (t("yes") || "Y") : (t("no") || "N"),
        ["이미지URL"]: p.imageUrl || "",
        ["이미지여부"]: p.hasImage ? (t("yes") || "Y") : (t("no") || "N"),
        ["구분(HQ/Store)"]: p.purchaseSource || "",
        ["정렬순서(sortOrder)"]: p.sortOrder ?? "",
        ["재고기본단위(stockBaseUnit)"]: p.stockBaseUnit || "",
        ["재고단위1"]: stock1?.unit || "",
        ["재고단위1 환산값"]: stock1?.factor ?? "",
        ["재고단위2"]: stock2?.unit || "",
        ["재고단위2 환산값"]: stock2?.factor ?? "",
        ["재고단위3"]: stock3?.unit || "",
        ["재고단위3 환산값"]: stock3?.factor ?? "",
        ["표준단위1"]: std1?.unit || "",
        ["표준단위1 총수량"]: std1?.totalQuantity ?? "",
        ["표준단위2"]: std2?.unit || "",
        ["표준단위2 총수량"]: std2?.totalQuantity ?? "",
        ["표준단위3"]: std3?.unit || "",
        ["표준단위3 총수량"]: std3?.totalQuantity ?? "",
        ["재고단위옵션(JSON)"]: JSON.stringify(stockUnitOptions),
        ["표준단위목록(JSON)"]: JSON.stringify(standardUnits),
        ["기본계정과목ID(accountSubjectId)"]: p.accountSubjectId ?? "",
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, t("itemsList") || "품목목록")

    const bangkokDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()).replace(/-/g, "")

    XLSX.writeFile(wb, `items-${bangkokDate}.xlsx`)
  }

  const filteredProducts = React.useMemo(() => {
    if (!hasSearched) return []
    const filtered = products.filter((p) => {
      const q = searchTerm.toLowerCase().trim()
      const matchTerm =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q) ||
        (p.spec || "").toLowerCase().includes(q) ||
        (p.description || "").toLowerCase().includes(q)
      const matchCategory = categoryFilter === "all" || p.category === categoryFilter
      const pLoc = (p.outboundLocation || "").trim() || "(미지정)"
      const matchOutbound = outboundFilter === "all" || pLoc === outboundFilter
      return matchTerm && matchCategory && matchOutbound
    })
    // 엑셀(ไฟล์เช็คสต๊อก) 엑셀에 나온 카테고리 순 → 같은 카테고리 안에서는 품목 sort_order → 코드 순
    return [...filtered].sort((a, b) => {
      const catA = (a.category || '').trim()
      const catB = (b.category || '').trim()
      const idxA = allCategories.indexOf(catA)
      const idxB = allCategories.indexOf(catB)
      const orderA = idxA < 0 ? 999999 : idxA
      const orderB = idxB < 0 ? 999999 : idxB
      if (orderA !== orderB) return orderA - orderB
      const oa = a.sortOrder ?? 999999
      const ob = b.sortOrder ?? 999999
      if (oa !== ob) return oa - ob
      return compareByCode(a.code, b.code)
    })
  }, [products, hasSearched, searchTerm, categoryFilter, outboundFilter, allCategories])

  const categories = React.useMemo(() => {
    const fromProducts = new Set(products.map((p) => p.category).filter(Boolean))
    const fromDb = new Set(allCategories)
    return Array.from(new Set([...fromDb, ...fromProducts])).sort()
  }, [products, allCategories])

  const outboundOptions = React.useMemo(() => {
    const fromProducts = new Set(products.map((p) => (p.outboundLocation || "").trim() || "(미지정)"))
    const fromLocs = new Set(outboundLocations.map((l) => l.location_code))
    return Array.from(new Set([...fromLocs, ...fromProducts])).sort()
  }, [products, outboundLocations])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Tags className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">{t("itemsMgmt")}</h1>
              <p className="text-xs text-muted-foreground">{t("itemsMgmtSub")}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleExcelImport}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 px-3 text-xs"
              onClick={() => excelInputRef.current?.click()}
              disabled={excelImporting}
              title={t("itemsExcelImportHint")}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {excelImporting ? t("loading") : t("itemsExcelImport")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 px-3 text-xs"
              onClick={handleExcelDownload}
              title={t("itemsExcelDownloadHint") || "품목 목록을 Excel로 저장"}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {t("itemsExcelDownload") || "Excel 다운로드"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 px-3 text-xs"
              onClick={() => setOutboundSettingsOpen(true)}
            >
              <Settings className="h-3.5 w-3.5" />
              {t("outboundLocationSettings") || "출고지 설정"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 px-3 text-xs"
              onClick={() => setCategorySettingsOpen(true)}
            >
              <Tags className="h-3.5 w-3.5" />
              {t("itemCategorySettings") || "카테고리 설정"}
            </Button>
          </div>
        </div>

        <OutboundLocationSettingsDialog
          open={outboundSettingsOpen}
          onOpenChange={setOutboundSettingsOpen}
          onSaved={loadOutboundLocations}
        />
        <ItemCategorySettingsDialog
          open={categorySettingsOpen}
          onOpenChange={setCategorySettingsOpen}
          onSaved={async () => {
            const { categories } = await getItemCategories()
            setAllCategories(categories || [])
          }}
        />

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}
        <Tabs value={itemsTab} onValueChange={(v) => setItemsTab(v as "list" | "priceHistory")} className={adminTabsRootCn}>
          <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="list" className={adminTabsTriggerCn}>
                  <Tags className={adminTabsIconCn} aria-hidden />
                  {t("itemsList") || "품목 목록"}
                </TabsTrigger>
                <TabsTrigger value="priceHistory" className={adminTabsTriggerCn}>
                  <History className={adminTabsIconCn} aria-hidden />
                  {t("itemsTabPriceHistory") || "품목 가격이력"}
                </TabsTrigger>
              </TabsList>
          </AdminTabsBarWithHelp>
          <TabsContent value="list" className={adminTabsContentCn}>
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="lg:sticky lg:top-0 lg:self-start">
            <ItemForm
              formData={formData}
              setFormData={setFormData}
              isEditing={!!editingCode}
              onSave={handleSave}
              onReset={handleReset}
              onNewRegister={handleNewRegister}
              categories={categories}
              outboundLocations={outboundLocations}
            />
          </div>
          <ItemTable
            products={filteredProducts}
            categories={categories}
            outboundOptions={outboundOptions}
            hasSearched={hasSearched}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            outboundFilter={outboundFilter}
            setOutboundFilter={setOutboundFilter}
            onSearch={handleSearch}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onToggleOrderDisabled={canToggleOrderPaused ? handleToggleOrderDisabled : undefined}
          />
        </div>
          </TabsContent>
          <TabsContent value="priceHistory" className={adminTabsContentCn}>
            <div className="rounded-xl border bg-card p-4 sm:p-6 space-y-4">
              <Tabs value={priceManageTab} onValueChange={(v) => setPriceManageTab(v as "history" | "schedule")}>
                <TabsList className={adminTabsListRowCn}>
                  <TabsTrigger value="history" className={adminTabsTriggerCn}>
                    {t("priceHistoryTabLabel") || "가격 이력"}
                  </TabsTrigger>
                  <TabsTrigger value="schedule" className={adminTabsTriggerCn}>
                    {t("priceScheduleTabLabel") || "가격 예약"}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="history" className="mt-4">
                  <PriceHistoryTab entityTypes={["item"]} mode="item" />
                </TabsContent>
                <TabsContent value="schedule" className="mt-4">
                  <PriceScheduleTab mode="item" canManage={isOfficeRole(auth?.role || "")} />
                </TabsContent>
              </Tabs>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
