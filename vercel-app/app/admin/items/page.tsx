"use client"

import * as React from "react"
import { ItemForm, type ItemFormData } from "@/components/erp/item-form"
import { ItemTable } from "@/components/erp/item-table"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getAdminItems, saveItem, deleteItem, type AdminItem } from "@/lib/api-client"

export type Product = AdminItem

const emptyForm: ItemFormData = {
  code: "",
  category: "",
  vendor: "",
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
  const [loading, setLoading] = React.useState(true)
  const [formData, setFormData] = React.useState<ItemFormData>(emptyForm)
  const [editingCode, setEditingCode] = React.useState<string | null>(null)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("all")

  React.useEffect(() => {
    getAdminItems()
      .then((list) => setProducts(list))
      .catch(() => setProducts([]))
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
      spec: formData.spec.trim(),
      price: Number(formData.price) || 0,
      cost: Number(formData.cost) || 0,
      taxType: formData.taxType,
      imageUrl: formData.imageUrl.trim(),
      editingCode: editingCode || undefined,
    })
    if (!res.success) {
      alert(res.message || "저장에 실패했습니다.")
      return
    }
    const newItem: Product = {
      code,
      name,
      category: formData.category.trim(),
      vendor: formData.vendor.trim(),
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
    setFormData(emptyForm)
    setEditingCode(null)
  }

  const handleEdit = (product: Product) => {
    setFormData({
      code: product.code,
      category: product.category,
      vendor: product.vendor,
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
      alert(res.message || "삭제에 실패했습니다.")
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
    const set = new Set(products.map((p) => p.category).filter(Boolean))
    return Array.from(set).sort()
  }, [products])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t("itemsMgmt")}</h1>
          <p className="text-xs text-muted-foreground">{t("itemsMgmtSub")}</p>
        </div>

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
