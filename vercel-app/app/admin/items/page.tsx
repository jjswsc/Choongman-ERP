"use client"

import * as React from "react"
import { Tags } from "lucide-react"
import { ItemForm, type ItemFormData } from "@/components/erp/item-form"
import { ItemTable } from "@/components/erp/item-table"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export interface Product {
  code: string
  name: string
  category: string
  vendor: string
  spec: string
  price: number
  cost: number
  taxType: "taxable" | "exempt" | "zero"
  imageUrl: string
  hasImage: boolean
}

const initialProducts: Product[] = [
  { code: "CM001", name: "TIGUDAK MIX SAUCE", category: "소스류", vendor: "", spec: "2.5kg*4ea", price: 1640, cost: 0, taxType: "taxable", imageUrl: "https://placehold.co/200x200?text=CM001", hasImage: true },
  { code: "CM002", name: "CHOONGMAN SPICY GARLIC SAUCE", category: "소스류", vendor: "", spec: "2.5kg*4ea", price: 1520, cost: 0, taxType: "taxable", imageUrl: "https://placehold.co/200x200?text=CM002", hasImage: true },
  { code: "CM004", name: "TIGUDAK CURRY SAUCE", category: "소스류", vendor: "", spec: "2.5kg*4ea", price: 1700, cost: 0, taxType: "taxable", imageUrl: "", hasImage: false },
  { code: "CM005", name: "WHITE SNOW SAUCE", category: "소스류", vendor: "", spec: "2.5kg*4ea", price: 1900, cost: 0, taxType: "taxable", imageUrl: "", hasImage: false },
  { code: "CM006", name: "TIGUDAK GARLIC SAUCE", category: "소스류", vendor: "", spec: "2.5kg*4ea", price: 2600, cost: 0, taxType: "taxable", imageUrl: "", hasImage: false },
  { code: "CM007", name: "HOT GREEN SAUCE (2.5kg*4ea/Box)", category: "소스류", vendor: "", spec: "2.5kg*1ea", price: 2400, cost: 0, taxType: "taxable", imageUrl: "https://placehold.co/200x200?text=CM007", hasImage: true },
  { code: "CM015", name: "CHOONGMAN KOREA SEASOINING", category: "파우더류", vendor: "", spec: "2kg*13ea", price: 0, cost: 0, taxType: "taxable", imageUrl: "", hasImage: false },
  { code: "CM016", name: "CHOONGMAN CHICKEN DRESSING POWDER (1kg*6ea/Box)", category: "파우더류", vendor: "", spec: "1kg*1ea", price: 1100, cost: 0, taxType: "taxable", imageUrl: "https://placehold.co/200x200?text=CM016", hasImage: true },
  { code: "CM017", name: "CHOONGMAN BATTER MIX FOR CHICKEN", category: "파우더류", vendor: "", spec: "5kg*4ea", price: 2100, cost: 0, taxType: "taxable", imageUrl: "https://placehold.co/200x200?text=CM017", hasImage: true },
  { code: "CM018", name: "BASE POWDER FOR SALTED RADISH", category: "파우더류", vendor: "", spec: "5kg*1ea", price: 2055, cost: 0, taxType: "taxable", imageUrl: "", hasImage: false },
  { code: "CM019", name: "CHOONGMAN TTEOKBOKKI SOUP POWDER", category: "파우더류", vendor: "", spec: "2kg*5ea", price: 3550, cost: 0, taxType: "taxable", imageUrl: "https://placehold.co/200x200?text=CM019", hasImage: true },
  { code: "CM020", name: "NEW REDMIX", category: "소스류", vendor: "", spec: "2.5kg*4ea", price: 2020, cost: 0, taxType: "taxable", imageUrl: "https://placehold.co/200x200?text=CM020", hasImage: true },
]

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
  const [products, setProducts] = React.useState<Product[]>(initialProducts)
  const [formData, setFormData] = React.useState<ItemFormData>(emptyForm)
  const [editingCode, setEditingCode] = React.useState<string | null>(null)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [categoryFilter, setCategoryFilter] = React.useState("all")

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

  const handleSave = () => {
    const code = formData.code.trim()
    const name = formData.name.trim()
    if (!code || !name) {
      alert(t("itemsAlertCodeName"))
      return
    }
    const price = Number(formData.price) || 0
    const cost = Number(formData.cost) || 0
    const newItem: Product = {
      code,
      name,
      category: formData.category.trim(),
      vendor: formData.vendor.trim(),
      spec: formData.spec.trim(),
      price,
      cost,
      taxType: formData.taxType,
      imageUrl: formData.imageUrl.trim(),
      hasImage: !!formData.imageUrl.trim(),
    }
    if (editingCode) {
      setProducts((prev) => prev.map((p) => (p.code === editingCode ? newItem : p)))
      alert(t("itemsAlertUpdated"))
    } else {
      if (products.some((p) => p.code === code)) {
        alert(t("itemsAlertCodeExists"))
        return
      }
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

  const handleDelete = (product: Product) => {
    if (!confirm(`"${product.name}" ${t("itemsConfirmDelete")}`)) return
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
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Tags className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("itemsMgmt")}</h1>
            <p className="text-xs text-muted-foreground">{t("itemsMgmtSub")}</p>
          </div>
        </div>

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
