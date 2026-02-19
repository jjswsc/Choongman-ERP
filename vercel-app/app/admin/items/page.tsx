"use client"

import * as React from "react"
import { Tags, Settings } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ItemForm, type ItemFormData } from "@/components/erp/item-form"
import { ItemTable } from "@/components/erp/item-table"
import { OutboundLocationSettingsDialog } from "@/components/erp/outbound-location-settings-dialog"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { getAdminItems, getItemCategories, getWarehouseLocations, saveItem, deleteItem, type AdminItem } from "@/lib/api-client"

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
  price: "",
  cost: "",
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
  const [outboundLocations, setOutboundLocations] = React.useState<{ location_code: string; name: string }[]>([])
  const [outboundSettingsOpen, setOutboundSettingsOpen] = React.useState(false)

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
        setFormData({
          code: p.code,
          category: p.category,
          vendor: p.vendor,
          outboundLocation: p.outboundLocation ?? "",
          name: p.name,
          imageUrl: p.imageUrl,
          taxType: p.taxType,
          spec: p.spec,
          price: String(p.price),
          cost: String(p.cost),
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
    const res = await saveItem({
      code,
      name,
      category: formData.category.trim(),
      vendor: formData.vendor.trim(),
      outboundLocation: formData.outboundLocation.trim(),
      spec: formData.spec.trim(),
      price: Number(formData.price) || 0,
      cost: Number(formData.cost) || 0,
      taxType: formData.taxType,
      imageUrl: formData.imageUrl.trim(),
      editingCode: editingCode || undefined,
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
      price: Number(formData.price) || 0,
      cost: Number(formData.cost) || 0,
      taxType: formData.taxType,
      imageUrl: formData.imageUrl.trim(),
      hasImage: !!formData.imageUrl.trim(),
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
    setFormData({
      code: product.code,
      category: product.category,
      vendor: product.vendor,
      outboundLocation: product.outboundLocation ?? "",
      name: product.name,
      imageUrl: product.imageUrl,
      taxType: product.taxType,
      spec: product.spec,
      price: String(product.price),
      cost: String(product.cost),
    })
    setEditingCode(product.code)
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

  const filteredProducts = React.useMemo(() => {
    if (!hasSearched) return []
    return products.filter((p) => {
      const matchTerm = !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.code.toLowerCase().includes(searchTerm.toLowerCase())
      const matchCategory = categoryFilter === "all" || p.category === categoryFilter
      return matchTerm && matchCategory
    })
  }, [products, hasSearched, searchTerm, categoryFilter])

  const categories = React.useMemo(() => {
    const fromProducts = new Set(products.map((p) => p.category).filter(Boolean))
    const fromDb = new Set(allCategories)
    return Array.from(new Set([...fromDb, ...fromProducts])).sort()
  }, [products, allCategories])

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
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 px-3 text-xs"
            onClick={() => setOutboundSettingsOpen(true)}
          >
            <Settings className="h-3.5 w-3.5" />
            {t("outboundLocationSettings") || "출고지 설정"}
          </Button>
        </div>

        <OutboundLocationSettingsDialog
          open={outboundSettingsOpen}
          onOpenChange={setOutboundSettingsOpen}
          onSaved={loadOutboundLocations}
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
            hasSearched={hasSearched}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            categoryFilter={categoryFilter}
            setCategoryFilter={setCategoryFilter}
            onSearch={handleSearch}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  )
}
