"use client"

import * as React from "react"
import { Building2, CheckCircle2, CircleAlert, Search } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { useLang } from "@/lib/lang-context"
import { useT, tr } from "@/lib/i18n"
import { appAlert } from "@/lib/app-message"
import Link from "next/link"
import {
  getAdminVendors,
  getStoreTaxFilingProfile,
  getStoreTaxFilingProfiles,
  saveStoreTaxFilingProfile,
  type AdminVendor,
  type StoreTaxFilingProfileDto,
} from "@/lib/api-client"
import { evaluateStoreTaxLink } from "@/lib/store-vendor-tax-link"

type Props = {
  storeOptions: string[]
  isOffice: boolean
  isManager: boolean
  managerStore: string
  canWrite: boolean
  initialStoreCode?: string
}

function profileIsComplete(p: StoreTaxFilingProfileDto | undefined): boolean {
  if (!p) return false
  const hasDirect = Boolean(String(p.taxpayerName || "").trim() && String(p.taxId || "").replace(/\D/g, "").length === 13)
  if (hasDirect) return true
  return Boolean(String(p.vendorCode || "").trim())
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1", className)}>
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      {children}
    </div>
  )
}

export function StoreTaxFilingProfilesPanel({
  storeOptions,
  isOffice,
  isManager,
  managerStore,
  canWrite,
  initialStoreCode,
}: Props) {
  const { lang } = useLang()
  const t = useT(lang)

  const storeCodes = React.useMemo(() => {
    if (!isOffice) return managerStore ? [managerStore] : []
    return storeOptions.filter((s) => s !== "All")
  }, [isOffice, managerStore, storeOptions])

  const [profilesByStore, setProfilesByStore] = React.useState<Record<string, StoreTaxFilingProfileDto>>({})
  const [vendors, setVendors] = React.useState<AdminVendor[]>([])
  const [listLoading, setListLoading] = React.useState(false)
  const [tableMissing, setTableMissing] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const [selectedStore, setSelectedStore] = React.useState("")
  const [formLoading, setFormLoading] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  const [taxpayerName, setTaxpayerName] = React.useState("")
  const [vendorCode, setVendorCode] = React.useState("")
  const [taxId, setTaxId] = React.useState("")
  const [branchNo, setBranchNo] = React.useState("00000")
  const [placeOfBusiness, setPlaceOfBusiness] = React.useState("")
  const [ssoAccountNo, setSsoAccountNo] = React.useState("")
  const [ssoBranchCode, setSsoBranchCode] = React.useState("")
  const [ssoAddress, setSsoAddress] = React.useState("")
  const [ssoPostcode, setSsoPostcode] = React.useState("")
  const [ssoPhone, setSsoPhone] = React.useState("")
  const [ssoFax, setSsoFax] = React.useState("")
  const [ssoEmail, setSsoEmail] = React.useState("")

  const loadList = React.useCallback(async () => {
    setListLoading(true)
    try {
      const { profiles, tableMissing: missing } = await getStoreTaxFilingProfiles()
      const map: Record<string, StoreTaxFilingProfileDto> = {}
      for (const p of profiles || []) {
        const code = String(p.storeCode || "").trim()
        if (code) map[code] = p
      }
      setProfilesByStore(map)
      setTableMissing(!!missing)
    } catch {
      setProfilesByStore({})
      setTableMissing(true)
    } finally {
      setListLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadList()
  }, [loadList])

  React.useEffect(() => {
    let cancelled = false
    void getAdminVendors()
      .then((rows) => {
        if (cancelled) return
        setVendors(rows || [])
      })
      .catch(() => {
        if (!cancelled) setVendors([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    const pick =
      initialStoreCode && storeCodes.includes(initialStoreCode)
        ? initialStoreCode
        : isManager && managerStore
          ? managerStore
          : storeCodes[0] || ""
    setSelectedStore(pick)
  }, [initialStoreCode, isManager, managerStore, storeCodes])

  const applyProfileToForm = React.useCallback((p: StoreTaxFilingProfileDto | null) => {
    setVendorCode(String(p?.vendorCode || ""))
    setTaxpayerName(String(p?.taxpayerName || ""))
    setTaxId(String(p?.taxId || ""))
    setBranchNo(String(p?.branchNo || "00000") || "00000")
    setPlaceOfBusiness(String(p?.placeOfBusiness || ""))
    setSsoAccountNo(String(p?.ssoAccountNo || ""))
    setSsoBranchCode(String(p?.ssoBranchCode || ""))
    setSsoAddress(String(p?.ssoOfficeAddress || ""))
    setSsoPostcode(String(p?.ssoPostcode || ""))
    setSsoPhone(String(p?.ssoPhone || ""))
    setSsoFax(String(p?.ssoFax || ""))
    setSsoEmail(String(p?.ssoEmail || ""))
  }, [])

  const vendorOptions = React.useMemo(
    () =>
      (vendors || [])
        .map((v) => ({
          code: String(v.code || "").trim(),
          name: String(v.name || "").trim(),
          taxId: String(v.tax_no || "").replace(/\D/g, "").trim(),
          salesOutlet: String(v.sales_outlet || "").trim(),
          gpsName: String(v.gps_name || "").trim(),
        }))
        .filter((v) => v.code),
    [vendors]
  )

  const recommendedVendorOptions = React.useMemo(() => {
    const store = String(selectedStore || "").trim().toLowerCase()
    if (!store) return [] as typeof vendorOptions
    return vendorOptions.filter((v) => {
      const outlet = String(v.salesOutlet || "").trim().toLowerCase()
      const gps = String(v.gpsName || "").trim().toLowerCase()
      return outlet === store || gps === store
    })
  }, [selectedStore, vendorOptions])

  const selectedVendorInfo = React.useMemo(
    () => vendorOptions.find((v) => v.code === String(vendorCode || "").trim()) || null,
    [vendorCode, vendorOptions]
  )

  const linkEval = React.useMemo(() => {
    if (!selectedStore) return null
    const profile = profilesByStore[selectedStore] || {
      storeCode: selectedStore,
      vendorCode,
      taxpayerName,
      taxId,
    }
    return evaluateStoreTaxLink(selectedStore, profile, vendorOptions)
  }, [selectedStore, profilesByStore, vendorCode, taxpayerName, taxId, vendorOptions])

  React.useEffect(() => {
    if (!selectedVendorInfo) return
    if (!taxpayerName.trim()) setTaxpayerName(selectedVendorInfo.name)
    if (!taxId.replace(/\D/g, "").trim() && selectedVendorInfo.taxId) setTaxId(selectedVendorInfo.taxId)
  }, [selectedVendorInfo, taxpayerName, taxId])

  const applyVendorMaster = React.useCallback(() => {
    if (!selectedVendorInfo) return
    setTaxpayerName(selectedVendorInfo.name)
    setTaxId(selectedVendorInfo.taxId)
  }, [selectedVendorInfo])

  React.useEffect(() => {
    if (!selectedStore) {
      applyProfileToForm(null)
      return
    }
    const cached = profilesByStore[selectedStore]
    if (cached) {
      applyProfileToForm(cached)
      return
    }
    let cancelled = false
    setFormLoading(true)
    void getStoreTaxFilingProfile(selectedStore)
      .then(({ profile }) => {
        if (cancelled) return
        applyProfileToForm(profile)
      })
      .finally(() => {
        if (!cancelled) setFormLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedStore, profilesByStore, applyProfileToForm])

  const filteredStores = React.useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return storeCodes
    return storeCodes.filter((code) => {
      const p = profilesByStore[code]
      const name = String(p?.taxpayerName || "").toLowerCase()
      return code.toLowerCase().includes(q) || name.includes(q)
    })
  }, [search, storeCodes, profilesByStore])

  const save = React.useCallback(async () => {
    if (!selectedStore) return
    if (!canWrite) {
      appAlert(t("accCompStoreTaxProfileNoWrite"))
      return
    }
    setSaving(true)
    try {
      const res = await saveStoreTaxFilingProfile({
        storeCode: selectedStore,
        vendorCode: vendorCode.trim(),
        taxpayerName: taxpayerName.trim(),
        taxId: taxId.replace(/\D/g, ""),
        branchNo: branchNo.replace(/\D/g, "") || "00000",
        placeOfBusiness: placeOfBusiness.trim(),
        ssoAccountNo: ssoAccountNo.trim(),
        ssoBranchCode: ssoBranchCode.trim(),
        ssoOfficeAddress: ssoAddress.trim(),
        ssoPostcode: ssoPostcode.replace(/\D/g, ""),
        ssoPhone: ssoPhone.trim(),
        ssoFax: ssoFax.trim(),
        ssoEmail: ssoEmail.trim(),
      })
      if (res.error === "TABLE_NOT_DEPLOYED") {
        setTableMissing(true)
        appAlert(t("accCompStoreTaxProfileTableMissing"))
        return
      }
      if (!res.success) {
        if (res.error === "INVALID_TAX_ID") appAlert(t("accCompStoreTaxProfileInvalidTaxId"))
        else if (res.error === "TAXPAYER_NAME_REQUIRED") appAlert(t("accCompStoreTaxProfileNameRequired"))
        else appAlert(t("msg_save_fail"))
        return
      }
      if (res.profile) {
        setProfilesByStore((prev) => ({ ...prev, [selectedStore]: res.profile! }))
        applyProfileToForm(res.profile)
      }
      appAlert(t("msg_save_ok"))
    } catch {
      appAlert(t("msg_save_fail"))
    } finally {
      setSaving(false)
    }
  }, [
    selectedStore,
    canWrite,
    vendorCode,
    taxpayerName,
    taxId,
    branchNo,
    placeOfBusiness,
    ssoAccountNo,
    ssoBranchCode,
    ssoAddress,
    ssoPostcode,
    ssoPhone,
    ssoFax,
    ssoEmail,
    applyProfileToForm,
    t,
  ])

  const completeCount = storeCodes.filter((c) => profileIsComplete(profilesByStore[c])).length

  return (
    <Card className="border-border/80">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" aria-hidden />
          {t("taxFilingTabStoreProfiles")}
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed">{t("taxFilingStoreProfilesIntro")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {tableMissing ? (
          <p className="text-xs text-amber-800 dark:text-amber-200/90 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-md px-3 py-2">
            {t("accCompStoreTaxProfileTableMissing")}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span>
            {tr(t, "taxFilingStoreProfilesStats", {
              complete: String(completeCount),
              total: String(storeCodes.length),
            })}
          </span>
          <Button type="button" size="sm" variant="outline" disabled={listLoading} onClick={() => void loadList()}>
            {listLoading ? t("loading") : t("refresh")}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,280px)_1fr] gap-4">
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
              <Input
                className="pl-8 h-9"
                placeholder={t("taxFilingStoreProfilesSearchPh")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                disabled={!isOffice && !!managerStore}
              />
            </div>
            <div className="max-h-[min(420px,50vh)] overflow-y-auto space-y-0.5 pr-1">
              {filteredStores.length === 0 ? (
                <p className="text-xs text-muted-foreground py-4 text-center">{t("noData")}</p>
              ) : (
                filteredStores.map((code) => {
                  const p = profilesByStore[code]
                  const ok = profileIsComplete(p)
                  const active = code === selectedStore
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => setSelectedStore(code)}
                      className={cn(
                        "w-full text-left rounded-md px-2.5 py-2 text-sm transition-colors",
                        active ? "bg-primary text-primary-foreground" : "hover:bg-muted/80"
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-medium truncate">{code}</span>
                        {ok ? (
                          <CheckCircle2
                            className={cn("h-4 w-4 shrink-0", active ? "text-primary-foreground" : "text-emerald-600")}
                            aria-hidden
                          />
                        ) : (
                          <CircleAlert
                            className={cn("h-4 w-4 shrink-0", active ? "text-primary-foreground/80" : "text-amber-600")}
                            aria-hidden
                          />
                        )}
                      </div>
                      {p?.taxpayerName ? (
                        <div
                          className={cn(
                            "text-[11px] truncate mt-0.5",
                            active ? "text-primary-foreground/90" : "text-muted-foreground"
                          )}
                        >
                          {p.taxpayerName}
                        </div>
                      ) : (
                        <div
                          className={cn(
                            "text-[11px] mt-0.5",
                            active ? "text-primary-foreground/80" : "text-amber-700 dark:text-amber-300"
                          )}
                        >
                          {t("taxFilingStoreProfilesIncomplete")}
                        </div>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="space-y-3">
            {!selectedStore ? (
              <p className="text-sm text-muted-foreground py-8 text-center">{t("taxFilingStoreProfilesPickStore")}</p>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                  <div className="text-sm font-medium">{selectedStore}</div>
                  <Button type="button" size="sm" onClick={() => void save()} disabled={saving || formLoading || !canWrite}>
                    {saving ? t("loading") : t("accCompSave")}
                  </Button>
                </div>
                {formLoading ? (
                  <p className="text-xs text-muted-foreground">{t("loading")}</p>
                ) : (
                  <Tabs defaultValue="pp30" className="w-full">
                    <TabsList className="h-9">
                      <TabsTrigger value="pp30" className="text-xs">
                        PP30 · e-Filing
                      </TabsTrigger>
                      <TabsTrigger value="sso" className="text-xs">
                        SSO (สปส.)
                      </TabsTrigger>
                    </TabsList>
                    <TabsContent value="pp30" className="mt-3 space-y-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">{t("taxFilingStoreProfilesPp30Hint")}</p>
                      <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2.5 space-y-2">
                        <Field label={t("taxFilingStoreProfilesVendorCode")}>
                          <Input
                            list="store-tax-filing-vendor-list"
                            placeholder={t("taxFilingStoreProfilesVendorCodePh")}
                            value={vendorCode}
                            onChange={(e) => setVendorCode(e.target.value.trim())}
                          />
                          <datalist id="store-tax-filing-vendor-list">
                            {vendorOptions.map((v) => (
                              <option key={v.code} value={v.code}>
                                {`${v.name}${v.taxId ? ` · TIN ${v.taxId}` : ""}`}
                              </option>
                            ))}
                          </datalist>
                        </Field>
                        {recommendedVendorOptions.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {recommendedVendorOptions.slice(0, 6).map((v) => (
                              <Button
                                key={v.code}
                                type="button"
                                size="sm"
                                variant={vendorCode === v.code ? "default" : "outline"}
                                className="h-7 px-2 text-[11px]"
                                onClick={() => setVendorCode(v.code)}
                              >
                                {v.code}
                              </Button>
                            ))}
                          </div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-2">
                          {linkEval?.status === "linked" ? (
                            <span className="text-[11px] rounded-md bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 px-2 py-0.5">
                              {t("taxFilingStoreProfilesLinkStatusLinked")}
                            </span>
                          ) : linkEval?.status === "inferred" ? (
                            <span className="text-[11px] rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-200 px-2 py-0.5">
                              {t("taxFilingStoreProfilesLinkStatusInferred")}
                            </span>
                          ) : linkEval?.status === "profile_only" ? (
                            <span className="text-[11px] rounded-md bg-sky-500/15 text-sky-800 dark:text-sky-200 px-2 py-0.5">
                              {t("taxFilingStoreProfilesLinkStatusProfileOnly")}
                            </span>
                          ) : (
                            <span className="text-[11px] rounded-md bg-destructive/10 text-destructive px-2 py-0.5">
                              {t("taxFilingStoreProfilesLinkStatusMissing")}
                            </span>
                          )}
                          {selectedVendorInfo ? (
                            <Button type="button" size="sm" variant="outline" className="h-7 text-[11px]" onClick={applyVendorMaster}>
                              {t("taxFilingStoreProfilesApplyVendor")}
                            </Button>
                          ) : null}
                          <Button type="button" size="sm" variant="ghost" className="h-7 text-[11px] px-2" asChild>
                            <Link href="/admin/vendors">{t("taxFilingStoreProfilesOpenVendors")}</Link>
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          {selectedVendorInfo
                            ? tr(t, "taxFilingStoreProfilesVendorSelected", {
                                name: selectedVendorInfo.name || selectedVendorInfo.code,
                                taxId: selectedVendorInfo.taxId || "-",
                              })
                            : t("taxFilingStoreProfilesVendorHint")}
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label={t("taxFilingStoreProfilesFieldName")}>
                          <Input
                            placeholder={t("accCompStoreTaxProfileNamePh")}
                            value={taxpayerName}
                            onChange={(e) => setTaxpayerName(e.target.value)}
                          />
                        </Field>
                        <Field label={t("taxFilingStoreProfilesFieldTaxId")}>
                          <Input
                            placeholder={t("accCompStoreTaxProfileTaxIdPh")}
                            value={taxId}
                            onChange={(e) => setTaxId(e.target.value)}
                          />
                        </Field>
                        <Field label={t("taxFilingStoreProfilesFieldBranch")}>
                          <Input
                            placeholder={t("accCompStoreTaxProfileBranchPh")}
                            value={branchNo}
                            onChange={(e) => setBranchNo(e.target.value)}
                          />
                        </Field>
                        <Field label={t("taxFilingStoreProfilesFieldPlace")}>
                          <Input
                            placeholder={t("accCompStoreTaxProfilePlacePh")}
                            value={placeOfBusiness}
                            onChange={(e) => setPlaceOfBusiness(e.target.value)}
                          />
                        </Field>
                      </div>
                    </TabsContent>
                    <TabsContent value="sso" className="mt-3 space-y-3">
                      <p className="text-xs text-muted-foreground leading-relaxed">{t("taxFilingStoreProfilesSsoHint")}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Field label={t("taxFilingStoreProfilesSsoAccount")}>
                          <Input value={ssoAccountNo} onChange={(e) => setSsoAccountNo(e.target.value)} />
                        </Field>
                        <Field label={t("taxFilingStoreProfilesSsoBranch")}>
                          <Input value={ssoBranchCode} onChange={(e) => setSsoBranchCode(e.target.value)} />
                        </Field>
                        <Field label={t("taxFilingStoreProfilesSsoPostcode")}>
                          <Input value={ssoPostcode} onChange={(e) => setSsoPostcode(e.target.value)} />
                        </Field>
                        <Field label={t("taxFilingStoreProfilesSsoPhone")}>
                          <Input value={ssoPhone} onChange={(e) => setSsoPhone(e.target.value)} />
                        </Field>
                        <Field label={t("taxFilingStoreProfilesSsoFax")}>
                          <Input value={ssoFax} onChange={(e) => setSsoFax(e.target.value)} />
                        </Field>
                        <Field label={t("taxFilingStoreProfilesSsoEmail")}>
                          <Input value={ssoEmail} onChange={(e) => setSsoEmail(e.target.value)} />
                        </Field>
                        <Field label={t("taxFilingStoreProfilesSsoAddress")} className="sm:col-span-2">
                          <Input value={ssoAddress} onChange={(e) => setSsoAddress(e.target.value)} />
                        </Field>
                      </div>
                    </TabsContent>
                  </Tabs>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
