"use client"
import { appAlert } from "@/lib/app-message"

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
import {
  adminTabsBarCn,
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Settings, RefreshCw, Copy } from "lucide-react"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useAuth } from "@/lib/auth-context"
import { canAccessSettings } from "@/lib/permissions"
import { formatEmployeeDisplayName } from "@/lib/employee-display-name"
import {
  useStoreList,
  getAdminEmployeeList,
  getHeadOfficeInfo,
  saveHeadOfficeInfo,
  getMenuPermission,
  setMenuPermission,
  getNotificationSettings,
  updateNotificationSettings,
  type HeadOfficeInfo,
  getAdminDataLimits,
  type AdminDataLimits,
  type AdminTableUsageRow,
  getFranchiseeMultiStoreSettings,
  saveFranchiseeMultiStoreSettings,
  type AdminEmployeeItem,
} from "@/lib/api-client"

function dataLimitKindLabel(kind: string, t: (key: string) => string): string {
  const key = `settings_data_limits_kind_${kind}`
  const label = t(key)
  return label === key ? kind : label
}

function sortTableUsage(rows: AdminTableUsageRow[]): AdminTableUsageRow[] {
  return [...rows].sort((a, b) => {
    const wa = (a.exceedsPagingCap ? 2 : 0) + (a.exceedsDefaultMaxRows ? 1 : 0)
    const wb = (b.exceedsPagingCap ? 2 : 0) + (b.exceedsDefaultMaxRows ? 1 : 0)
    if (wb !== wa) return wb - wa
    return (b.rowCount ?? 0) - (a.rowCount ?? 0)
  })
}

const CM_ADMIN_DATA_LIMITS_NOTE_KEY = "cm_admin_data_limits_note"

type SettingsTab = "office" | "permission" | "notification" | "dataLimits" | "franchisee" | "about"

const MENU_IDS = [
  "dashboard", "notices", "work-log", "item-manage", "vendor-manage",
  "outbound", "stock", "inbound", "force", "hr-employee", "attendance-manage",
  "payroll", "hr-leave", "petty-cash", "store-manage", "store-visit",
  "store-complaint", "store-repair", "settings",
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
  "store-repair": "adminStoreRepairs",
  settings: "adminSettings",
}

export function AdminSettings() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)

  const [tab, setTab] = useState<SettingsTab>("office")

  const [companyName, setCompanyName] = useState("")
  const [taxId, setTaxId] = useState("")
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [bankInfo, setBankInfo] = useState("")
  const [officeSaving, setOfficeSaving] = useState(false)

  const [permStores, setPermStores] = useState<string[]>([])
  const [permStore, setPermStore] = useState("")
  const [permEmployees, setPermEmployees] = useState<
    { store: string; name: string; nick: string; legalName: string; nameTitle?: string }[]
  >([])
  const [permEmployee, setPermEmployee] = useState("")
  const [permChecks, setPermChecks] = useState<Record<string, boolean>>({})
  const [permLoading, setPermLoading] = useState(false)
  const [permSaving, setPermSaving] = useState(false)

  const [pushNoticeEnabled, setPushNoticeEnabled] = useState(true)
  const [pushOrderApprovalEnabled, setPushOrderApprovalEnabled] = useState(true)
  const [notificationLoading, setNotificationLoading] = useState(false)
  const [notificationSaving, setNotificationSaving] = useState(false)

  const [limitsData, setLimitsData] = useState<AdminDataLimits | null>(null)
  const [limitsLoading, setLimitsLoading] = useState(false)
  const [limitsError, setLimitsError] = useState("")
  const [limitsNote, setLimitsNote] = useState("")

  const [franchiseeMultiEnabled, setFranchiseeMultiEnabled] = useState(false)
  const [franchiseeMultiMax, setFranchiseeMultiMax] = useState(5)
  const [franchiseeMultiLoading, setFranchiseeMultiLoading] = useState(false)
  const [franchiseeMultiSaving, setFranchiseeMultiSaving] = useState(false)

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

  const { stores: storeKeys } = useStoreList()
  const loadPermOptions = useCallback(async () => {
    setPermStores(storeKeys)
    const empRes = await getAdminEmployeeList({ userStore: auth?.store || "", userRole: auth?.role || "director" })
    if (storeKeys.length && !permStore) setPermStore(storeKeys[0])

    const list: { store: string; name: string; nick: string; legalName: string; nameTitle?: string }[] = []
    for (const e of empRes.list || []) {
      const row = e as AdminEmployeeItem
      const st = String(row.store || "").trim()
      const legalName = String(row.name || "").trim()
      const name = String(row.nick || "").trim() || legalName
      if (st && name)
        list.push({
          store: st,
          name,
          nick: String(row.nick || "").trim(),
          legalName,
          nameTitle: row.nameTitle,
        })
    }
    setPermEmployees(list)
  }, [auth?.store, auth?.role, storeKeys])

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

  const loadNotificationSettings = useCallback(async () => {
    setNotificationLoading(true)
    try {
      const d = await getNotificationSettings()
      setPushNoticeEnabled(d.pushNoticeEnabled ?? true)
      setPushOrderApprovalEnabled(d.pushOrderApprovalEnabled ?? true)
    } catch {
      setPushNoticeEnabled(true)
      setPushOrderApprovalEnabled(true)
    } finally {
      setNotificationLoading(false)
    }
  }, [])

  useEffect(() => {
    loadHeadOffice()
  }, [loadHeadOffice])

  useEffect(() => {
    try {
      const s = typeof localStorage !== "undefined" ? localStorage.getItem(CM_ADMIN_DATA_LIMITS_NOTE_KEY) : null
      if (s) setLimitsNote(s)
    } catch {
      /* ignore */
    }
  }, [])

  const loadDataLimits = useCallback(async () => {
    setLimitsLoading(true)
    setLimitsError("")
    try {
      setLimitsData(await getAdminDataLimits())
    } catch (e) {
      setLimitsData(null)
      setLimitsError(e instanceof Error ? e.message : String(e))
    } finally {
      setLimitsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === "dataLimits") void loadDataLimits()
  }, [tab, loadDataLimits])

  const loadFranchiseeMulti = useCallback(async () => {
    setFranchiseeMultiLoading(true)
    try {
      const r = await getFranchiseeMultiStoreSettings()
      if (r?.settings) {
        setFranchiseeMultiEnabled(!!r.settings.enabled)
        setFranchiseeMultiMax(Math.min(20, Math.max(1, Number(r.settings.maxStores) || 5)))
      }
    } catch {
      setFranchiseeMultiEnabled(false)
      setFranchiseeMultiMax(5)
    } finally {
      setFranchiseeMultiLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab === "franchisee") void loadFranchiseeMulti()
  }, [tab, loadFranchiseeMulti])

  useEffect(() => {
    loadPermOptions()
  }, [loadPermOptions])

  useEffect(() => {
    if (tab === "notification") loadNotificationSettings()
  }, [tab, loadNotificationSettings])

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
      await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
      if (res.success) loadHeadOffice()
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setOfficeSaving(false)
    }
  }

  const handleSaveNotification = async () => {
    setNotificationSaving(true)
    try {
      const res = await updateNotificationSettings({
        pushNoticeEnabled,
        pushOrderApprovalEnabled,
      })
      await appAlert(res.success ? (t("settings_saved") || "저장되었습니다.") : (t("msg_save_fail") || "저장에 실패했습니다."))
      if (res.success) loadNotificationSettings()
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setNotificationSaving(false)
    }
  }

  const handleSavePerm = async () => {
    if (!permStore || !permEmployee) {
      await appAlert(t("settings_menu_permission_hint"))
      return
    }
    setPermSaving(true)
    try {
      const out: Record<string, number> = {}
      for (const [key, checked] of Object.entries(permChecks)) {
        if (checked) out[key] = 1
      }
      const res = await setMenuPermission(permStore, permEmployee, out)
      await appAlert(translateApiMessage(res.message, t) || t("msg_save_fail"))
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setPermSaving(false)
    }
  }

  const filteredEmployees = permEmployees.filter((e) => e.store === permStore)
  const togglePerm = (key: string) => {
    setPermChecks((p) => ({ ...p, [key]: !p[key] }))
  }

  const persistLimitsNote = (v: string) => {
    setLimitsNote(v)
    try {
      localStorage.setItem(CM_ADMIN_DATA_LIMITS_NOTE_KEY, v)
    } catch {
      /* ignore */
    }
  }

  const handleSaveFranchiseeMulti = async () => {
    if (!canAccessSettings(auth?.role || "")) {
      await appAlert(t("apiPermissionDenied"))
      return
    }
    setFranchiseeMultiSaving(true)
    try {
      const res = await saveFranchiseeMultiStoreSettings({
        enabled: franchiseeMultiEnabled,
        maxStores: franchiseeMultiMax,
      })
      await appAlert(
        res.success ? (t("settings_saved") || "저장되었습니다.") : (t("msg_save_fail") || "저장에 실패했습니다.")
      )
      if (res.success) void loadFranchiseeMulti()
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    } finally {
      setFranchiseeMultiSaving(false)
    }
  }

  const handleCopyLimits = async () => {
    if (!limitsData) {
      await appAlert(t("settings_data_limits_no_data"))
      return
    }
    try {
      const payload = { ...limitsData, localBrowserNote: limitsNote }
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      await appAlert(t("settings_data_limits_copied"))
    } catch (e) {
      await appAlert(t("msg_error_prefix") + (e instanceof Error ? e.message : String(e)))
    }
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

        <Tabs value={tab} onValueChange={(v) => setTab(v as SettingsTab)} className={adminTabsRootCn}>
          <div className={adminTabsBarCn}>
            <div className={adminTabsScrollCn}>
              <TabsList className={adminTabsListRowCn}>
                <TabsTrigger value="office" className={adminTabsTriggerCn}>
                  {t("settings_head_office")}
                </TabsTrigger>
                <TabsTrigger value="permission" className={adminTabsTriggerCn}>
                  {t("settings_menu_permission")}
                </TabsTrigger>
                <TabsTrigger value="notification" className={adminTabsTriggerCn}>
                  {t("settings_notification_tab")}
                </TabsTrigger>
                <TabsTrigger value="dataLimits" className={adminTabsTriggerCn}>
                  {t("settings_data_limits_tab")}
                </TabsTrigger>
                <TabsTrigger value="franchisee" className={adminTabsTriggerCn}>
                  {t("settings_franchisee_multi_tab")}
                </TabsTrigger>
                <TabsTrigger value="about" className={adminTabsTriggerCn}>
                  {t("settings_permission_title")}
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

          <TabsContent value="office" className={adminTabsContentCn}>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground mb-4">{t("settings_head_office_desc")}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("settings_company_name")}</label>
                    <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="h-9 text-xs" placeholder={t("settings_ph_company")} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("settings_tax_id")}</label>
                    <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="h-9 text-xs" placeholder={t("settings_ph_tax_id")} />
                  </div>
                </div>
                <div className="mt-3">
                  <label className="text-xs font-semibold block mb-1">{t("settings_address")}</label>
                  <Input value={address} onChange={(e) => setAddress(e.target.value)} className="h-9 text-xs" placeholder={t("settings_ph_address")} />
                </div>
                <div className="mt-3">
                  <label className="text-xs font-semibold block mb-1">{t("settings_phone")}</label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-xs" placeholder={t("settings_ph_phone")} />
                </div>
                <div className="mt-3">
                  <label className="text-xs font-semibold block mb-1">{t("settings_bank_info")}</label>
                  <Input value={bankInfo} onChange={(e) => setBankInfo(e.target.value)} className="h-9 text-xs" placeholder={t("settings_ph_bank")} />
                </div>
                <Button className="mt-4 h-9" onClick={handleSaveOffice} disabled={officeSaving}>
                  {officeSaving ? t("loading") : t("settings_save_btn")}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="permission" className={adminTabsContentCn}>
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
                          <SelectItem key={`${e.store}-${e.name}`} value={e.name}>
                            {formatEmployeeDisplayName(e.legalName, e.nameTitle)}
                          </SelectItem>
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

          <TabsContent value="notification" className={adminTabsContentCn}>
            <Card>
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground mb-4">{t("settings_notification_desc")}</p>
                {notificationLoading ? (
                  <p className="py-6 text-center text-muted-foreground text-xs">{t("loading")}</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="text-sm font-medium">{t("settings_push_notice")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("settings_push_notice_desc")}</p>
                      </div>
                      <Checkbox
                        checked={pushNoticeEnabled}
                        onCheckedChange={(v) => setPushNoticeEnabled(!!v)}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div>
                        <p className="text-sm font-medium">{t("settings_push_order_approval")}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{t("settings_push_order_approval_desc")}</p>
                      </div>
                      <Checkbox
                        checked={pushOrderApprovalEnabled}
                        onCheckedChange={(v) => setPushOrderApprovalEnabled(!!v)}
                      />
                    </div>
                    <Button className="h-9" onClick={handleSaveNotification} disabled={notificationSaving}>
                      {notificationSaving ? t("loading") : t("settings_save_btn")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dataLimits" className={adminTabsContentCn}>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <p className="text-xs text-muted-foreground">{t("settings_data_limits_desc")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={() => void loadDataLimits()} disabled={limitsLoading}>
                    <RefreshCw className={`h-3.5 w-3.5 ${limitsLoading ? "animate-spin" : ""}`} />
                    {limitsLoading ? t("loading") : t("settings_data_limits_refresh")}
                  </Button>
                  <Button type="button" variant="outline" className="h-9 gap-1.5" onClick={() => void handleCopyLimits()} disabled={!limitsData}>
                    <Copy className="h-3.5 w-3.5" />
                    {t("settings_data_limits_copy")}
                  </Button>
                </div>
                {limitsError ? (
                  <p className="text-sm text-destructive">{limitsError}</p>
                ) : null}
                {limitsLoading && !limitsData ? (
                  <p className="py-6 text-center text-muted-foreground text-xs">{t("loading")}</p>
                ) : limitsData ? (
                  <>
                    <p className="text-xs text-amber-700 dark:text-amber-500/90 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                      {t("settings_data_limits_formula")
                        .replace("{{pages}}", String(limitsData.selectAllPagesMaxPages))
                        .replace("{{cap}}", String(limitsData.selectPageCap))
                        .replace("{{rows}}", (limitsData.selectAllPagesMaxPages * limitsData.selectPageCap).toLocaleString())}
                    </p>
                    <div className="overflow-x-auto rounded-lg border text-xs">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-muted/50 border-b">
                            <th className="text-left p-2.5 font-medium w-[45%]">{t("settings_data_limits_col_name")}</th>
                            <th className="text-left p-2.5 font-medium">{t("settings_data_limits_col_value")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="border-b">
                            <td className="p-2.5 align-top text-muted-foreground">{t("settings_dl_select_page_cap")}</td>
                            <td className="p-2.5 font-mono">{limitsData.selectPageCap.toLocaleString()}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-2.5 align-top text-muted-foreground">{t("settings_dl_env_max")}</td>
                            <td className="p-2.5 font-mono break-all">
                              {limitsData.envSupabaseSelectPageSizeMax ?? "—"}
                            </td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-2.5 align-top text-muted-foreground">{t("settings_dl_all_pages_max")}</td>
                            <td className="p-2.5 font-mono">{limitsData.selectAllPagesMaxPages.toLocaleString()}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-2.5 align-top text-muted-foreground">{t("settings_dl_all_pages_rows")}</td>
                            <td className="p-2.5 font-mono">{limitsData.selectAllPagesDefaultMaxRows.toLocaleString()}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-2.5 align-top text-muted-foreground">{t("settings_dl_filter_pages_max")}</td>
                            <td className="p-2.5 font-mono">{limitsData.selectFilterAllPagesMaxPages.toLocaleString()}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-2.5 align-top text-muted-foreground">{t("settings_dl_filter_rows_max")}</td>
                            <td className="p-2.5 font-mono">{limitsData.selectFilterAllPagesMaxRowsCeiling.toLocaleString()}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-2.5 align-top text-muted-foreground">{t("settings_dl_filter_stride")}</td>
                            <td className="p-2.5 font-mono">{limitsData.selectFilterAllPagesMinStride.toLocaleString()}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-2.5 align-top text-muted-foreground">{t("settings_data_limits_extracted_at")}</td>
                            <td className="p-2.5 font-mono break-all">{limitsData.limitsExtractedAt ?? "—"}</td>
                          </tr>
                          <tr className="border-b">
                            <td className="p-2.5 align-top text-muted-foreground">{t("settings_data_limits_extracted_count")}</td>
                            <td className="p-2.5 font-mono">{(limitsData.limitsExtractedCount ?? 0).toLocaleString()}</td>
                          </tr>
                          <tr>
                            <td className="p-2.5 align-top text-muted-foreground">{t("settings_dl_fetched_at")}</td>
                            <td className="p-2.5 font-mono break-all">{limitsData.fetchedAt}</td>
                          </tr>
                          <tr className="bg-muted/50 border-y">
                            <td colSpan={2} className="p-2.5 text-xs font-semibold">
                              {t("settings_data_limits_table_section")}
                            </td>
                          </tr>
                          {sortTableUsage(limitsData.tableUsage ?? []).map((u) => (
                            <tr
                              key={u.table}
                              className={
                                u.exceedsPagingCap || u.exceedsDefaultMaxRows
                                  ? "border-b border-amber-500/25 bg-amber-500/5"
                                  : "border-b border-border/60"
                              }
                            >
                              <td className="p-2.5 align-top text-muted-foreground font-mono text-[11px]">{u.table}</td>
                              <td className="p-2.5 align-top">
                                {u.error ? (
                                  <span className="text-destructive text-[11px]">{u.error}</span>
                                ) : (
                                  <div className="space-y-0.5">
                                    <div className="font-mono text-sm">
                                      {(u.rowCount ?? 0).toLocaleString()} {t("settings_data_limits_rows_suffix")}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground leading-snug">
                                      {t("settings_data_limits_row_detail_caps")
                                        .replace("{{paging}}", u.capFromPaging.toLocaleString())
                                        .replace("{{total}}", u.defaultMaxRows.toLocaleString())}
                                      {" · "}
                                      {u.exceedsDefaultMaxRows
                                        ? t("settings_data_limits_usage_warn_max")
                                        : u.exceedsPagingCap
                                          ? t("settings_data_limits_usage_warn_paging")
                                          : t("settings_data_limits_usage_ok")}
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <ul className="text-[11px] text-muted-foreground space-y-1 list-disc pl-4">
                      <li>{t("settings_data_limits_hint_rows")}</li>
                      <li>{t("settings_data_limits_hint_env")}</li>
                      <li>{t("settings_data_limits_hint_all_pages")}</li>
                    </ul>

                    <p className="text-[11px] text-muted-foreground border-t pt-3">{t("settings_data_limits_codegen_note")}</p>

                    <div className="space-y-2 border-t pt-4">
                      <h3 className="text-sm font-semibold">{t("settings_data_limits_routes_title")}</h3>
                      <p className="text-[11px] text-muted-foreground">{t("settings_data_limits_routes_desc")}</p>
                      <div className="max-h-[min(70vh,720px)] overflow-auto rounded-lg border text-xs">
                        <table className="w-full border-collapse">
                          <thead className="sticky top-0 bg-muted/95 z-[1]">
                            <tr className="border-b">
                              <th className="text-left p-2 font-medium whitespace-nowrap">{t("settings_data_limits_routes_col_location")}</th>
                              <th className="text-left p-2 font-medium whitespace-nowrap">{t("settings_data_limits_routes_col_kind")}</th>
                              <th className="text-right p-2 font-medium whitespace-nowrap">{t("settings_data_limits_routes_col_code")}</th>
                              <th className="text-left p-2 font-medium whitespace-nowrap">{t("settings_data_limits_routes_col_effective")}</th>
                              <th className="text-left p-2 font-medium min-w-[120px]">{t("settings_data_limits_routes_col_path")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(limitsData.routeLimits ?? []).map((r, i) => (
                              <tr key={`${r.path}-${r.line}-${i}`} className="border-b border-border/60">
                                <td className="p-2 align-top text-muted-foreground whitespace-pre-wrap break-all">{r.apiLabel}</td>
                                <td className="p-2 align-top">{dataLimitKindLabel(r.kind, t)}</td>
                                <td className="p-2 align-top font-mono text-[11px] text-right">{r.value.toLocaleString()}</td>
                                <td className="p-2 align-top font-mono text-[11px]">{r.effectiveDisplay}</td>
                                <td className="p-2 align-top font-mono text-[10px] text-muted-foreground break-all">
                                  {r.path}:{r.line}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : null}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold block">{t("settings_data_limits_note_label")}</label>
                  <Textarea
                    value={limitsNote}
                    onChange={(e) => persistLimitsNote(e.target.value)}
                    placeholder={t("settings_data_limits_note_ph")}
                    className="min-h-[88px] text-xs"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="franchisee" className={adminTabsContentCn}>
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div>
                  <h2 className="text-sm font-bold text-foreground">{t("settings_franchisee_multi_title")}</h2>
                  <p className="text-xs text-muted-foreground mt-1">{t("settings_franchisee_multi_desc")}</p>
                </div>
                {franchiseeMultiLoading ? (
                  <p className="py-6 text-center text-muted-foreground text-xs">{t("loading")}</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 rounded-lg border p-4">
                      <Checkbox
                        id="franchisee_multi_enabled"
                        checked={franchiseeMultiEnabled}
                        onCheckedChange={(c) => setFranchiseeMultiEnabled(c === true)}
                        disabled={!canAccessSettings(auth?.role || "")}
                      />
                      <label htmlFor="franchisee_multi_enabled" className="text-sm cursor-pointer">
                        {t("settings_franchisee_multi_enabled")}
                      </label>
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1">{t("settings_franchisee_multi_max")}</label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        className="h-9 w-32 text-xs"
                        value={franchiseeMultiMax}
                        onChange={(e) => {
                          const n = Math.min(20, Math.max(1, parseInt(e.target.value, 10) || 1))
                          setFranchiseeMultiMax(n)
                        }}
                        disabled={!franchiseeMultiEnabled || !canAccessSettings(auth?.role || "")}
                      />
                    </div>
                    <Button
                      className="h-9"
                      onClick={() => void handleSaveFranchiseeMulti()}
                      disabled={franchiseeMultiSaving || !canAccessSettings(auth?.role || "")}
                    >
                      {franchiseeMultiSaving ? t("loading") : t("settings_franchisee_multi_save")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="about" className={adminTabsContentCn}>
            <Card>
              <CardContent className="pt-6 space-y-6">
                <p className="text-sm text-muted-foreground">{t("settings_perm_intro")}</p>

                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-foreground">{t("settings_perm_role_director")}</h3>
                  <p className="text-sm text-muted-foreground pl-2">{t("settings_perm_role_director_desc")}</p>

                  <h3 className="text-sm font-bold text-foreground mt-4">{t("settings_perm_role_officer")}</h3>
                  <p className="text-sm text-muted-foreground pl-2">{t("settings_perm_role_officer_desc")}</p>

                  <h3 className="text-sm font-bold text-foreground mt-4">{t("settings_perm_role_manager")}</h3>
                  <p className="text-sm text-muted-foreground pl-2">{t("settings_perm_role_manager_desc")}</p>

                  <h3 className="text-sm font-bold text-foreground mt-4">{t("settings_perm_role_franchisee")}</h3>
                  <p className="text-sm text-muted-foreground pl-2">{t("settings_perm_role_franchisee_desc")}</p>
                </div>

                <p className="text-sm text-muted-foreground pl-2 border-l-2 border-primary/40 py-1">
                  {t("settings_perm_eval_note")}
                </p>
                <div>
                  <h4 className="text-sm font-semibold mb-3">{t("settings_perm_table_title")}</h4>
                  <div className="overflow-x-auto rounded-lg border text-sm">
                    <table className="w-full border-collapse table-fixed">
                      <colgroup>
                        <col className="w-[30%]" />
                        <col className="w-[70%]" />
                      </colgroup>
                      <thead>
                        <tr className="bg-muted/50">
                          <th className="text-center p-2.5 font-medium border-b">{t("settings_perm_table_col_menu")}</th>
                          <th className="text-center p-2.5 font-medium border-b">{t("settings_perm_table_col_mgr")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminWorkLog")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_view_only")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminItems")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_denied")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminVendors")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_denied")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminOrders")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_view_no_edit")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminStock")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_stock_note")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminInbound")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_view_only")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminOutbound")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_outbound_note")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminForce")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_denied")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminEmployees")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_employees_note")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminEmployeeEval")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_eval_list_only")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminAttendance")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_full")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminLeave")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_full")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminPayroll")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_payroll_note")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminPettyCash")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_full")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminReceivablePayable")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_receivable_note")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminStoreCheck")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_full")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminStoreVisit")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_view_only")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminComplaints")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_complaints_note")}</td></tr>
                        <tr className="border-b"><td className="p-2.5 text-center">{t("adminStoreRepairs")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_repair_note")}</td></tr>
                        <tr><td className="p-2.5 text-center">{t("adminSettings")}</td><td className="p-2.5 text-center text-muted-foreground">{t("settings_perm_mgr_denied")}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground pt-2">{t("settings_permission_note")}</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
