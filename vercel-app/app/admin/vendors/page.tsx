"use client"

import * as React from "react"
import { VendorForm, type VendorFormData } from "@/components/erp/vendor-form"
import { VendorTable } from "@/components/erp/vendor-table"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { getAdminVendors, saveVendor, deleteVendor } from "@/lib/api-client"
import type { Vendor } from "@/components/erp/vendor-table"

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
  const [vendors, setVendors] = React.useState<Vendor[]>([])
  const [loading, setLoading] = React.useState(true)
  const [formData, setFormData] = React.useState<VendorFormData>(emptyForm)
  const [editingCode, setEditingCode] = React.useState<string | null>(null)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")

  React.useEffect(() => {
    getAdminVendors()
      .then((list) => setVendors(list))
      .catch(() => setVendors([]))
      .finally(() => setLoading(false))
  }, [])

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

  const handleSave = async () => {
    const code = formData.code.trim()
    const name = formData.name.trim()
    if (!code || !name) {
      alert(t("vendorAlertCodeName"))
      return
    }
    if (!editingCode && vendors.some((v) => v.code === code)) {
      alert(t("vendorAlertCodeExists"))
      return
    }
    const res = await saveVendor({
      code,
      name,
      contact: formData.contact.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      address: formData.address.trim(),
      type: formData.type,
      memo: formData.memo.trim(),
      editingCode: editingCode || undefined,
    })
    if (!res.success) {
      alert(res.message || "저장에 실패했습니다.")
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

  const handleDelete = async (vendor: Vendor) => {
    if (!confirm(`"${vendor.name}" ${t("vendorConfirmDelete")}`)) return
    const res = await deleteVendor({ code: vendor.code })
    if (!res.success) {
      alert(res.message || "삭제에 실패했습니다.")
      return
    }
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
      return matchTerm
    })
  }, [vendors, hasSearched, searchTerm])

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold tracking-tight text-foreground">{t("vendorMgmt")}</h1>
          <p className="text-xs text-muted-foreground">{t("vendorMgmtSub")}</p>
        </div>

        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}
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
