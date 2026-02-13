"use client"

import * as React from "react"
import { Building2 } from "lucide-react"
import { VendorForm, type VendorFormData } from "@/components/erp/vendor-form"
import { VendorTable } from "@/components/erp/vendor-table"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import type { Vendor } from "@/components/erp/vendor-table"

const initialVendors: Vendor[] = [
  { code: "V001", name: "ABC Trading Co.", contact: "John Lee", phone: "02-1234-5678", email: "john@abc.com", address: "Bangkok 10110", type: "purchase", memo: "" },
  { code: "V002", name: "Global Food Supply", contact: "Kim Park", phone: "02-2345-6789", email: "kim@global.co.th", address: "Samut Prakan", type: "purchase", memo: "" },
  { code: "V003", name: "Fresh Ingredients Ltd.", contact: "Sarah Chen", phone: "081-xxx-xxxx", email: "sarah@fresh.com", address: "Pathum Thani", type: "both", memo: "" },
]

const emptyForm: VendorFormData = {
  code: "",
  name: "",
  contact: "",
  phone: "",
  email: "",
  address: "",
  type: "purchase",
  memo: "",
}

export default function VendorsPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const [vendors, setVendors] = React.useState<Vendor[]>(initialVendors)
  const [formData, setFormData] = React.useState<VendorFormData>(emptyForm)
  const [editingCode, setEditingCode] = React.useState<string | null>(null)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState("all")

  const handleNewRegister = () => {
    setFormData(emptyForm)
    setEditingCode(null)
  }

  const handleReset = () => {
    if (editingCode) {
      const v = vendors.find((x) => x.code === editingCode)
      if (v) {
        setFormData({
          code: v.code,
          name: v.name,
          contact: v.contact,
          phone: v.phone,
          email: v.email,
          address: v.address,
          type: v.type,
          memo: v.memo,
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
      alert(t("vendorAlertCodeName"))
      return
    }
    const newVendor: Vendor = {
      code,
      name,
      contact: formData.contact.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      address: formData.address.trim(),
      type: formData.type,
      memo: formData.memo.trim(),
    }
    if (editingCode) {
      setVendors((prev) => prev.map((v) => (v.code === editingCode ? newVendor : v)))
      alert(t("vendorAlertUpdated"))
    } else {
      if (vendors.some((v) => v.code === code)) {
        alert(t("vendorAlertCodeExists"))
        return
      }
      setVendors((prev) => [...prev, newVendor])
      alert(t("vendorAlertSaved"))
    }
    setFormData(emptyForm)
    setEditingCode(null)
  }

  const handleEdit = (vendor: Vendor) => {
    setFormData({
      code: vendor.code,
      name: vendor.name,
      contact: vendor.contact,
      phone: vendor.phone,
      email: vendor.email,
      address: vendor.address,
      type: vendor.type,
      memo: vendor.memo,
    })
    setEditingCode(vendor.code)
  }

  const handleDelete = (vendor: Vendor) => {
    if (!confirm(`"${vendor.name}" ${t("vendorConfirmDelete")}`)) return
    setVendors((prev) => prev.filter((v) => v.code !== vendor.code))
    if (editingCode === vendor.code) {
      setFormData(emptyForm)
      setEditingCode(null)
    }
    alert(t("vendorAlertDeleted"))
  }

  const handleSearch = () => {
    setHasSearched(true)
  }

  const filteredVendors = React.useMemo(() => {
    if (!hasSearched) return []
    return vendors.filter((v) => {
      const matchTerm = !searchTerm || v.name.toLowerCase().includes(searchTerm.toLowerCase()) || v.code.toLowerCase().includes(searchTerm.toLowerCase())
      const matchType = typeFilter === "all" || v.type === typeFilter
      return matchTerm && matchType
    })
  }, [vendors, hasSearched, searchTerm, typeFilter])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{t("vendorMgmt")}</h1>
            <p className="text-xs text-muted-foreground">{t("vendorMgmtSub")}</p>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <VendorForm
            formData={formData}
            setFormData={setFormData}
            isEditing={!!editingCode}
            onSave={handleSave}
            onReset={handleReset}
            onNewRegister={handleNewRegister}
          />
          <VendorTable
            vendors={filteredVendors}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            hasSearched={hasSearched}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onSearch={handleSearch}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  )
}
