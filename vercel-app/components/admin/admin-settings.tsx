"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Settings } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAuth } from "@/lib/auth-context"
import {
  getLoginData,
  getAdminEmployeeList,
  getHeadOfficeInfo,
  saveHeadOfficeInfo,
  getMenuPermission,
  setMenuPermission,
  type HeadOfficeInfo,
} from "@/lib/api-client"

const MENU_IDS = [
  "dashboard", "notices", "work-log", "item-manage", "vendor-manage",
  "outbound", "stock", "inbound", "force", "hr-employee", "attendance-manage",
  "payroll", "hr-leave", "petty-cash", "store-manage", "store-visit",
  "store-complaint", "settings",
]

const MENU_TO_TKEY: Record<string, string> = {
  dashboard: "adminDashboard",
  notices: "adminNotices",
  "work-log": "adminWorkLog",
  "item-manage": "adminItems",
  "vendor-manage": "adminVendors",
  outbound: "adminOutbound",
  stock: "adminStock",
  inbound: "adminInbound",
  force: "adminForce",
  "hr-employee": "adminEmployees",
  "attendance-manage": "adminAttendance",
  payroll: "adminPayroll",
  "hr-leave": "adminLeave",
  "petty-cash": "adminPettyCash",
  "store-manage": "adminStoreCheck",
  "store-visit": "adminStoreVisit",
  "store-complaint": "adminComplaints",
  settings: "adminSettings",
}

export function AdminSettings() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [tab, setTab] = useState<"office" | "permission" | "about">("office")

  const [companyName, setCompanyName] = useState("")
  const [taxId, setTaxId] = useState("")
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [bankInfo, setBankInfo] = useState("")
  const [officeSaving, setOfficeSaving] = useState(false)

  const [permStores, setPermStores] = useState<string[]>([])
  const [permStore, setPermStore] = useState("")
  const [permEmployees, setPermEmployees] = useState<{ store: string; name: string; nick: string }[]>([])
  const [permEmployee, setPermEmployee] = useState("")
  const [permChecks, setPermChecks] = useState<Record<string, boolean>>({})
  const [permLoading, setPermLoading] = useState(false)
  const [permSaving, setPermSaving] = useState(false)

  const isHQ = auth?.role === "director" || auth?.role === "officer"

  const loadHeadOffice = useCallback(async () => {
    try {
      const d = await getHeadOfficeInfo()
      setCompanyName(d.companyName || "")
      setTaxId(d.taxId || "")
      setAddress(d.address || "")
      setPhone(d.phone || "")
      setBankInfo(d.bankInfo || "")
    } catch {
      setCompanyName("")
      setTaxId("")
      setAddress("")
      setPhone("")
      setBankInfo("")
    }
  }, [])

  const loadPermOptions = useCallback(async () => {
    const [loginRes, empRes] = await Promise.all([
      getLoginData(),
      getAdminEmployeeList({ userStore: auth?.store || "", userRole: auth?.role || "director" }),
    ])
    const storeKeys = Object.keys(loginRes.users || {}).filter(Boolean).sort()
    setPermStores(storeKeys)
    if (storeKeys.length && !permStore) setPermStore(storeKeys[0])

    const list: { store: string; name: string; nick: string }[] = []
    for (const e of empRes.list || []) {
      const st = String(e.store || "").trim()
      const name = String(e.nick || "").trim() || String(e.name || "").trim()
      if (st && name) list.push({ store: st, name, nick: String(e.nick || "").trim() })
    }
    setPermEmployees(list)
  }, [auth?.store, auth?.role])

  const loadPermForEmployee = useCallback(async () => {
    if (!permStore || !permEmployee) return
    setPermLoading(true)
    try {
      const perm = await getMenuPermission(permStore, permEmployee)
      const checks: Record<string, boolean> = {}
      for (const id of MENU_IDS) {
        checks[`${id}_view`] = !!(perm[`${id}_view`] || perm[id])
        checks[`${id}_edit`] = !!(perm[`${id}_edit`])
      }
      setPermChecks(checks)
    } catch {
      setPermChecks({})
    } finally {
      setPermLoading(false)
    }
  }, [permStore, permEmployee])

  useEffect(() => {
    loadHeadOffice()
  }, [loadHeadOffice])

  useEffect(() => {
    loadPermOptions()
  }, [loadPermOptions])

  useEffect(() => {
    if (permStore && permEmployee) loadPermForEmployee()
    else setPermChecks({})
  }, [permStore, permEmployee, loadPermForEmployee])

  const handleSaveOffice = async () => {
    setOfficeSaving(true)
    try {
      const res = await saveHeadOfficeInfo({
        companyName,
        taxId,
        address,
        phone,
        bankInfo,
      })
      alert(res.success ? res.message : res.message || "저장 실패")
      if (res.success) loadHeadOffice()
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setOfficeSaving(false)
    }
  }

  const handleSavePerm = async () => {
    if (!permStore || !permEmployee) {
      alert(t("settings_menu_permission_hint"))
      return
    }
    setPermSaving(true)
    try {
      const out: Record<string, number> = {}
      for (const [key, checked] of Object.entries(permChecks)) {
        if (checked) out[key] = 1
      }
      const res = await setMenuPermission(permStore, permEmployee, out)
      alert(res.success ? res.message : res.message || "저장 실패")
    } catch (e) {
      alert(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setPermSaving(false)
    }
  }

  const filteredEmployees = permEmployees.filter((e) => e.store === permStore)
  const togglePerm = (key: string) => {
    setPermChecks((p) => ({ ...p, [key]: !p[key] }))
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6 lg:px-8 space-y-4">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Settings className="h-4 w-4 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">{t("adminSettings")}</h1>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "office" | "permission" | "about")}>
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="office">{t("settings_head_office")}</TabsTrigger>
            <TabsTrigger value="permission">{t("settings_menu_permission")}</TabsTrigger>
            <TabsTrigger value="about">{t("settings_permission_title")}</TabsTrigger>
          </TabsList>

          <TabsContent value="office" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground mb-4">{t("settings_head_office_desc")}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("settings_company_name")}</label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-9 text-xs" placeholder="본사 회사명" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("settings_tax_id")}</label>
                    <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="h-9 text-xs" placeholder="사업자번호" />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-xs font-semibold block mb-1">{t("settings_address")}</label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-9 text-xs" placeholder="본사 주소" />
                </div>
                <div className="mt-3">
                  <label className="text-xs font-semibold block mb-1">{t("settings_phone")}</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-xs" placeholder="전화번호" />
                </div>
                <div className="mt-3">
                  <label className="text-xs font-semibold block mb-1">{t("settings_bank_info")}</label>
                  <Input value={bankInfo} onChange={(e) => setBankInfo(e.target.value)} className="h-9 text-xs" placeholder="은행명, 계좌번호, 예금주 등" />
                </div>
                <Button className="mt-4 h-9" onClick={handleSaveOffice} disabled={officeSaving}>
                  {officeSaving ? t("loading") : t("settings_save_btn")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permission" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap items-end gap-3 mb-4">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("store")}</label>
                    <Select value={permStore} onValueChange={(v) => { setPermStore(v); setPermEmployee("") }}>
                      <SelectTrigger className="h-9 w-[140px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {permStores.map((st) => (
                          <SelectItem key={st} value={st}>{st}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("hrUser")}</label>
                    <Select value={permEmployee} onValueChange={setPermEmployee}>
                      <SelectTrigger className="h-9 w-[140px] text-xs">
                        <SelectValue placeholder={t("label_employee")} />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredEmployees.map((e) => (
                          <SelectItem key={`${e.store}-${e.name}`} value={e.name}>{e.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="h-9" onClick={handleSavePerm} disabled={permSaving || permLoading}>
                    {permSaving ? t("loading") : t("btn_save")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mb-4">{t("settings_menu_permission_hint")}</p>
                {permLoading ? (
                  <p className="py-6 text-center text-muted-foreground text-xs">{t("loading")}</p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {MENU_IDS.map((id) => (
                      <div key={id} className="flex items-center gap-2 rounded border p-2">
                        <Checkbox
                          id={`perm_${id}`}
                          checked={!!permChecks[`${id}_view`]}
                          onCheckedChange={() => togglePerm(`${id}_view`)}
                        />
                        <label htmlFor={`perm_${id}`} className="text-xs cursor-pointer flex-1">
                          {t(MENU_TO_TKEY[id] || id)}
                        </label>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="about" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <p className="mb-3 text-sm">{t("settings_permission_hq")}</p>
                <p className="mb-3 text-sm">{t("settings_permission_store")}</p>
                <p className="text-sm text-muted-foreground">{t("settings_permission_note")}</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
