"use client"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Building2 } from "lucide-react"
import { VendorForm, type VendorFormData } from "@/components/erp/vendor-form"
import { VendorTable, type VendorTypeFilter } from "@/components/erp/vendor-table"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { getAdminVendors, getStoreTaxFilingProfiles, saveVendor, deleteVendor, useStoreList } from "@/lib/api-client"
import type { Vendor } from "@/components/erp/vendor-table"
import type { VendorLinkedStore } from "@/components/erp/vendor-table"
import { storesLinkedToVendor } from "@/lib/store-vendor-tax-link"
import { useErpPageActive, useErpRefetchOnActivate } from "@/lib/erp-page-visibility"
import {
  consumeVendorEditIntent,
  peekVendorEditIntent,
} from "@/lib/expense-payee-vendor-href"

const emptyForm: VendorFormData = {
  code: "",
  name: "",
  gps_name: "",
  sales_outlet: "",
  contact: "",
  phone: "",
  email: "",
  address: "",
  tax_no: "",
  type: "purchase",
  memo: "",
  direct_settlement: false,
  bank_name: "",
  bank_account_no: "",
}

export default function VendorsPage() {
  const { lang } = useLang()
  const t = useT(lang)
  const searchParams = useSearchParams()
  const pageActive = useErpPageActive()
  const [vendors, setVendors] = React.useState<Vendor[]>([])
  const [loading, setLoading] = React.useState(true)
  const [formData, setFormData] = React.useState<VendorFormData>(emptyForm)
  const [editingCode, setEditingCode] = React.useState<string | null>(null)
  const [hasSearched, setHasSearched] = React.useState(false)
  const [searchTerm, setSearchTerm] = React.useState("")
  const [typeFilter, setTypeFilter] = React.useState<VendorTypeFilter>("all")
  const [profilesByStore, setProfilesByStore] = React.useState<Record<string, { storeCode: string; vendorCode?: string }>>({})
  const [deepLinkBanner, setDeepLinkBanner] = React.useState(false)
  const reloadSeqRef = React.useRef(0)
  const deepLinkKeyRef = React.useRef<string>("")
  const { stores: storeList, storeLabels, legacyToCanonical } = useStoreList()

  const storeCodes = React.useMemo(
    () =>
      Array.from(new Set((storeList || []).map((s) => String(s).trim()).filter((s) => s && s !== "All"))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [storeList]
  )

  const reloadVendors = React.useCallback(() => {
    const seq = ++reloadSeqRef.current
    setLoading(true)
    return Promise.all([getAdminVendors(), getStoreTaxFilingProfiles()])
      .then(([list, profRes]) => {
        if (seq !== reloadSeqRef.current) return
        setVendors(list)
        const map: Record<string, { storeCode: string; vendorCode?: string }> = {}
        for (const p of profRes.profiles || []) {
          const sc = String(p.storeCode || "").trim()
          if (sc) map[sc] = { storeCode: sc, vendorCode: p.vendorCode }
        }
        setProfilesByStore(map)
      })
      .catch(() => {
        if (seq !== reloadSeqRef.current) return
        setVendors([])
        setProfilesByStore({})
      })
      .finally(() => {
        if (seq === reloadSeqRef.current) setLoading(false)
      })
  }, [])

  React.useEffect(() => {
    void reloadVendors()
  }, [reloadVendors])

  useErpRefetchOnActivate(() => {
    void reloadVendors()
  })

  const linkedStoresByVendor = React.useMemo(() => {
    const out: Record<string, VendorLinkedStore[]> = {}
    const profiles = Object.values(profilesByStore)
    for (const v of vendors) {
      out[v.code] = storesLinkedToVendor(
        {
          code: v.code,
          name: v.name,
          tax_no: v.tax_no,
          gps_name: v.gps_name,
          sales_outlet: v.sales_outlet,
        },
        storeCodes,
        profiles,
        storeLabels,
        legacyToCanonical
      )
    }
    return out
  }, [vendors, storeCodes, profilesByStore, storeLabels, legacyToCanonical])

  const editingLinkedStores = React.useMemo(
    () => (editingCode ? linkedStoresByVendor[editingCode] || [] : []),
    [editingCode, linkedStoresByVendor]
  )

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
          gps_name: v.gps_name ?? "",
          sales_outlet: v.sales_outlet ?? "",
          contact: v.contact,
          phone: v.phone,
          email: v.email,
          address: v.address,
          tax_no: v.tax_no ?? "",
          type: v.type,
          memo: v.memo,
          direct_settlement: v.direct_settlement ?? false,
          bank_name: v.bank_name ?? "",
          bank_account_no: v.bank_account_no ?? "",
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
      await appAlert(t("vendorAlertCodeName"))
      return
    }
    if (!editingCode && vendors.some((v) => v.code === code)) {
      await appAlert(t("vendorAlertCodeExists"))
      return
    }
    const res = await saveVendor({
      code,
      name,
      gps_name: formData.gps_name.trim() || undefined,
      sales_outlet: formData.sales_outlet.trim() || undefined,
      contact: formData.contact.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      address: formData.address.trim(),
      tax_no: formData.tax_no.trim() || undefined,
      type: formData.type,
      memo: formData.memo.trim(),
      direct_settlement: formData.direct_settlement,
      bank_name: formData.bank_name.trim() || undefined,
      bank_account_no: formData.bank_account_no.trim() || undefined,
      editingCode: editingCode || undefined,
    })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail_detail"))
      return
    }
    const newVendor: Vendor = {
      code,
      name,
      gps_name: formData.gps_name.trim() || undefined,
      sales_outlet: formData.sales_outlet.trim() || undefined,
      contact: formData.contact.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim(),
      address: formData.address.trim(),
      tax_no: formData.tax_no.trim() || undefined,
      type: formData.type,
      memo: formData.memo.trim(),
      direct_settlement: formData.direct_settlement,
      bank_name: formData.bank_name.trim() || undefined,
      bank_account_no: formData.bank_account_no.trim() || undefined,
    }
    if (editingCode) {
      setVendors((prev) => prev.map((v) => (v.code === editingCode ? newVendor : v)))
      await appAlert(t("vendorAlertUpdated"))
    } else {
      setVendors((prev) => [...prev, newVendor])
      await appAlert(t("vendorAlertSaved"))
    }
    setFormData(emptyForm)
    setEditingCode(null)
  }

  const handleEdit = React.useCallback((vendor: Vendor) => {
    setFormData({
      code: vendor.code,
      name: vendor.name,
      gps_name: vendor.gps_name ?? "",
      sales_outlet: vendor.sales_outlet ?? "",
      contact: vendor.contact,
      phone: vendor.phone,
      email: vendor.email,
      address: vendor.address,
      tax_no: vendor.tax_no ?? "",
      type: vendor.type,
      memo: vendor.memo,
      direct_settlement: vendor.direct_settlement ?? false,
      bank_name: vendor.bank_name ?? "",
      bank_account_no: vendor.bank_account_no ?? "",
    })
    setEditingCode(vendor.code)
  }, [])

  const findVendorForDeepLink = React.useCallback(
    (codeRaw: string, qRaw: string): Vendor | null => {
      const code = String(codeRaw || "").trim()
      const q = String(qRaw || "").trim()
      if (code) {
        const exact =
          vendors.find((x) => x.code === code) ||
          vendors.find((x) => x.code.toLowerCase() === code.toLowerCase())
        if (exact) return exact
      }
      const term = (q || code).trim()
      if (!term) return null
      const lower = term.toLowerCase()
      const matches = vendors.filter((v) => {
        const name = (v.name || "").toLowerCase()
        const gps = (v.gps_name || "").toLowerCase()
        const outlet = (v.sales_outlet || "").toLowerCase()
        const vc = (v.code || "").toLowerCase()
        return (
          vc === lower ||
          name === lower ||
          gps === lower ||
          outlet === lower ||
          name.includes(lower) ||
          gps.includes(lower) ||
          vc.includes(lower)
        )
      })
      if (matches.length === 1) return matches[0]
      return (
        matches.find(
          (v) =>
            v.code.toLowerCase() === lower ||
            (v.name || "").toLowerCase() === lower ||
            (v.gps_name || "").toLowerCase() === lower
        ) || null
      )
    },
    [vendors]
  )

  const focusBankFields = React.useCallback(() => {
    window.setTimeout(() => {
      document.getElementById("vendor-bank-fields")?.scrollIntoView({ behavior: "smooth", block: "center" })
      const input = document.getElementById("vendor-bank-account-no") as HTMLInputElement | null
      input?.focus()
      input?.select()
    }, 120)
  }, [])

  const applyVendorDeepLink = React.useCallback(
    (intent: { code?: string; q?: string; focusBank?: boolean }, force = false) => {
      const code = String(intent.code || "").trim()
      const q = String(intent.q || "").trim()
      if (!code && !q) return false
      const baseKey = `${code}|${q}`

      if (!force && deepLinkKeyRef.current === `${baseKey}|ok` && editingCode) {
        if (intent.focusBank) focusBankFields()
        return true
      }

      const vendor = findVendorForDeepLink(code, q)
      if (vendor) {
        deepLinkKeyRef.current = `${baseKey}|ok`
        handleEdit(vendor)
        setSearchTerm(vendor.code)
        setHasSearched(true)
        setTypeFilter("all")
        setDeepLinkBanner(Boolean(intent.focusBank))
        if (intent.focusBank) focusBankFields()
        return true
      }

      deepLinkKeyRef.current = `${baseKey}|search`
      setSearchTerm(q || code)
      setHasSearched(true)
      setDeepLinkBanner(Boolean(intent.focusBank))
      return false
    },
    [editingCode, findVendorForDeepLink, focusBankFields, handleEdit]
  )

  // Deep link from Expense Management "Account missing" → open vendor edit (+ bank fields).
  React.useEffect(() => {
    if (!pageActive || loading) return

    const session = peekVendorEditIntent()
    const code = String(session?.code || searchParams.get("code") || "").trim()
    const q = String(session?.q || searchParams.get("q") || "").trim()
    const focusBank = Boolean(session?.focusBank) || searchParams.get("focus") === "bank"
    if (!code && !q) return

    // Wait for vendor list before consuming session intent (avoid losing the target).
    if (session && vendors.length === 0) return

    const applied = applyVendorDeepLink({ code, q, focusBank }, Boolean(session))
    if (session) consumeVendorEditIntent()
    void applied
  }, [pageActive, loading, vendors, searchParams, applyVendorDeepLink])

  const handleDelete = async (vendor: Vendor) => {
    const displayName = (vendor.type === "sales" || vendor.type === "both") && (vendor.gps_name?.trim() || vendor.sales_outlet?.trim())
      ? vendor.gps_name || vendor.sales_outlet || vendor.name
      : vendor.name
    if (!await appConfirm(`"${displayName}" ${t("vendorConfirmDelete")}`)) return
    const res = await deleteVendor({ code: vendor.code })
    if (!res.success) {
      await appAlert(translateApiMessage(res.message, t) || t("msg_delete_fail_detail"))
      return
    }
    setVendors((prev) => prev.filter((v) => v.code !== vendor.code))
    if (editingCode === vendor.code) {
      setFormData(emptyForm)
      setEditingCode(null)
    }
    await appAlert(t("vendorAlertDeleted"))
  }

  const handleSearch = () => {
    setHasSearched(true)
  }

  const filteredVendors = React.useMemo(() => {
    if (!hasSearched) return []
    return vendors.filter((v) => {
      const matchType =
        typeFilter === "all" ||
        (typeFilter === "purchase" && (v.type === "purchase" || v.type === "both")) ||
        (typeFilter === "sales" && (v.type === "sales" || v.type === "both"))
      const matchTerm =
        !searchTerm ||
        v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.gps_name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        (v.sales_outlet || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.code.toLowerCase().includes(searchTerm.toLowerCase())
      return matchType && matchTerm
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

        {deepLinkBanner && editingCode ? (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
            {t("expenseBankAccountMissingHint") ||
              "Open Vendor Management to enter the bank account"}
            {" — "}
            <span className="font-semibold">{formData.name || editingCode}</span>
          </div>
        ) : null}
        {loading && (
          <div className="mb-4 rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            {t("loading")}
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          <div className="lg:sticky lg:top-4 lg:self-start">
          <VendorForm
            formData={formData}
            setFormData={setFormData}
            isEditing={!!editingCode}
            onSave={handleSave}
            onReset={handleReset}
            onNewRegister={handleNewRegister}
            linkedStores={editingLinkedStores}
          />
          </div>
          <VendorTable
            vendors={filteredVendors}
            hasSearched={hasSearched}
            loading={loading}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            typeFilter={typeFilter}
            setTypeFilter={setTypeFilter}
            onSearch={handleSearch}
            onEdit={handleEdit}
            onDelete={handleDelete}
            linkedStoresByVendor={linkedStoresByVendor}
          />
        </div>
      </div>
    </div>
  )
}
