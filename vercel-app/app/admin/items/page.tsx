"use client"

import * as React from "react"
import { Tags, Settings, FileSpreadsheet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ItemForm, type ItemFormData } from "@/components/erp/item-form"
import { ItemTable } from "@/components/erp/item-table"
import { OutboundLocationSettingsDialog } from "@/components/erp/outbound-location-settings-dialog"
import { ItemCategorySettingsDialog } from "@/components/erp/item-category-settings-dialog"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { getAdminItems, getItemCategories, getWarehouseLocations, saveItem, deleteItem, updateItemOrderDisabled, importItemsFromExcel, type AdminItem } from "@/lib/api-client"

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
}

export default function ItemsPage() {
  const { lang } = useLang()
  const t = useT(lang)
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
      alert(t("itemsAlertCodeName"))
      return
    }
    if (!editingCode && products.some((p) => p.code === code)) {
      alert(t("itemsAlertCodeExists"))
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
    })
    if (!res.success) {
      alert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
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
    }
    if (editingCode) {
      setProducts((prev) => prev.map((p) => (p.code === editingCode ? newItem : p)))
      alert(t("itemsAlertUpdated"))
    } else {
      setProducts((prev) => [...prev, newItem])
      alert(t("itemsAlertSaved"))
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
    })
    setEditingCode(product.code)
  }

  const handleToggleOrderDisabled = async (product: Product) => {
    const nextDisabled = !product.orderDisabled
    const res = await updateItemOrderDisabled({ code: product.code, disabled: nextDisabled })
    if (!res.success) {
      alert(translateApiMessage(res.message, t) || res.message || t("msg_save_fail_detail"))
      return
    }
    setProducts((prev) =>
      prev.map((p) => (p.code === product.code ? { ...p, orderDisabled: nextDisabled } : p))
    )
  }

  const handleDelete = async (product: Product) => {
    if (!confirm(`"${product.name}" ${t("itemsConfirmDelete")}`)) return
    const res = await deleteItem({ code: product.code })
    if (!res.success) {
      alert(translateApiMessage(res.message, t) || t("msg_delete_fail_detail"))
      return
    }
    setProducts((prev) => prev.filter((p) => p.code !== product.code))
    if (editingCode === product.code) {
      setFormData(emptyForm)
      setEditingCode(null)
    }
    alert(t("itemsAlertDeleted"))
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
        alert(res.message || (res.added ? `${res.added}건 등록` : '완료'))
        const [list] = await Promise.all([getAdminItems()])
        setProducts(list || [])
      } else {
        alert(res.message || '가져오기 실패')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : '오류')
    } finally {
      setExcelImporting(false)
    }
  }

  const filteredProducts = React.useMemo(() => {
    if (!hasSearched) return []
    return products.filter((p) => {
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
  }, [products, hasSearched, searchTerm, categoryFilter, outboundFilter])

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
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
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
            onToggleOrderDisabled={handleToggleOrderDisabled}
          />
        </div>
      </div>
    </div>
  )
}
