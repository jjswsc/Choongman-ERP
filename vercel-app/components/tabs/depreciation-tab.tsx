"use client"

import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import { appAlert, appConfirm } from "@/lib/app-message"

import * as React from "react"
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
  adminTabsContentFlushCn,
  adminTabsListRowCn,
  adminTabsScrollCn,
  adminTabsTriggerCn,
} from "@/lib/admin-tab-styles"
import { cn } from "@/lib/utils"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Plus, Pencil, Calculator, Trash2, RotateCcw } from "lucide-react"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isOfficeRole } from "@/lib/permissions"
import {
  getFixedAssets,
  saveFixedAsset,
  setFixedAssetStatus,
  getDepreciationEntries,
  runDepreciation,
  getAccountSubjects,
  type AccountSubjectItem,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { getBangkokRecentYearMonths } from "@/lib/bangkok-time"
import { CHART_OF_ACCOUNTS_BY_CODE } from "@/lib/chart-of-accounts-mapping"

const OFFICE_STORES = ["본사", "Office", "오피스", "본점"]

type FixedAssetRow = {
  id?: number
  asset_code?: string
  name?: string
  store_name?: string
  acquisition_date?: string
  acquisition_cost?: number
  useful_life_months?: number
  status?: string
  disposed_at?: string | null
  memo?: string | null
  asset_account_code?: string | null
  accumulated_depreciation_account_code?: string | null
  depreciation_expense_account_code?: string | null
  disposed_proceeds?: number | null
  disposal_gain_loss_amount?: number | null
  disposal_journal_entry_id?: number | null
}

type DepreciationEntryRow = {
  assetName?: string
  storeName?: string
  accounting_date?: string
  amount?: number
  journal_entry_id?: number
}

export function DepreciationTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const storeOptionLabel = React.useCallback(
    (s: string) => (s === "All" ? t("all") : s),
    [t],
  )
  const { stores: storeList } = useStoreList()
  const isOffice = isOfficeRole(auth?.role || "")

  const [storeFilter, setStoreFilter] = React.useState("All")
  const [yearMonth, setYearMonth] = React.useState(() => getBangkokRecentYearMonths(1)[0])
  const [disposeDate, setDisposeDate] = React.useState(() => new Date().toISOString().slice(0, 10))
  const [disposalProceeds, setDisposalProceeds] = React.useState("")
  const [disposalGainAccountCode, setDisposalGainAccountCode] = React.useState("4110")
  const [disposalLossAccountCode, setDisposalLossAccountCode] = React.useState("5520")
  const [disposalMemo, setDisposalMemo] = React.useState("")

  const [assets, setAssets] = React.useState<FixedAssetRow[]>([])
  const [disposedAssets, setDisposedAssets] = React.useState<FixedAssetRow[]>([])
  const [entries, setEntries] = React.useState<DepreciationEntryRow[]>([])
  const [entriesTotal, setEntriesTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [statusUpdating, setStatusUpdating] = React.useState(false)
  const [accountSubjects, setAccountSubjects] = React.useState<AccountSubjectItem[]>([])

  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [form, setForm] = React.useState({
    assetCode: "",
    name: "",
    storeName: "All",
    acquisitionDate: "",
    acquisitionCost: "",
    residualRate: "0",
    usefulLifeMonths: "60",
    assetAccountCode: "1460",
    accumulatedDepreciationAccountCode: "1470",
    depreciationExpenseAccountCode: "5500",
    memo: "",
  })
  const [saving, setSaving] = React.useState(false)

  const storeOptions = React.useMemo(() => {
    if (!isOffice) return [auth?.store || "All"]
    const uniq = Array.from(
      new Set(
        ["본사", ...((storeList || []).filter((s) => !OFFICE_STORES.includes(s) && !s.toLowerCase().includes("office")) || [])]
          .map((s) => String(s || "").trim())
          .filter(Boolean)
      )
    )
    return ["All", ...uniq]
  }, [isOffice, auth?.store, storeList])

  const yearMonthOptions = getBangkokRecentYearMonths(24)

  const accountSubjectDisplayName = React.useCallback(
    (s: AccountSubjectItem) => {
      const code = String(s.code || "").trim().toUpperCase()
      const meta = code ? CHART_OF_ACCOUNTS_BY_CODE[code] : undefined
      if (lang === "en") {
        return (s.nameEn || meta?.nameEn || s.name || meta?.nameKo || code).trim()
      }
      if (lang === "th") {
        return (s.nameTh || s.nameEn || meta?.nameEn || s.name || meta?.nameKo || code).trim()
      }
      return (meta?.nameKo || s.name || s.nameEn || meta?.nameEn || code).trim()
    },
    [lang]
  )

  const accountOptions = React.useMemo(() => {
    const uniq = new Map<string, AccountSubjectItem>()
    const defaultCodes: { code: string; type: string }[] = [
      { code: "1460", type: "asset" },
      { code: "1470", type: "asset" },
      { code: "5500", type: "expense" },
      { code: "4110", type: "revenue" },
      { code: "5520", type: "expense" },
    ]
    for (const { code, type } of defaultCodes) {
      const meta = CHART_OF_ACCOUNTS_BY_CODE[code]
      uniq.set(code, {
        code,
        name: meta?.nameKo ?? code,
        nameEn: meta?.nameEn ?? null,
        type,
        sortOrder: 0,
      })
    }
    for (const s of accountSubjects || []) {
      const code = String(s.code || "").trim().toUpperCase()
      if (!code) continue
      if (!uniq.has(code)) uniq.set(code, s)
    }
    return Array.from(uniq.values()).sort((a, b) => String(a.code).localeCompare(String(b.code)))
  }, [accountSubjects])

  const labelByCode = React.useCallback(
    (code: string, fallback: string) => {
      const c = String(code || "").trim().toUpperCase()
      if (!c) return fallback
      const hit = accountOptions.find((x) => String(x.code || "").trim().toUpperCase() === c)
      return hit ? `${c} · ${accountSubjectDisplayName(hit)}` : c
    },
    [accountOptions, accountSubjectDisplayName]
  )

  const loadAssets = React.useCallback(() => {
    setLoading(true)
    getFixedAssets({ storeFilter: storeFilter !== "All" ? storeFilter : undefined, status: "active" })
      .then((r) => setAssets((r.list || []) as FixedAssetRow[]))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false))
  }, [storeFilter])

  const loadDisposedAssets = React.useCallback(() => {
    setLoading(true)
    getFixedAssets({ storeFilter: storeFilter !== "All" ? storeFilter : undefined, status: "disposed" })
      .then((r) => setDisposedAssets((r.list || []) as FixedAssetRow[]))
      .catch(() => setDisposedAssets([]))
      .finally(() => setLoading(false))
  }, [storeFilter])

  const loadEntries = React.useCallback(() => {
    setLoading(true)
    getDepreciationEntries({
      yearMonth,
      storeFilter: storeFilter !== "All" ? storeFilter : undefined,
    })
      .then((r) => {
        setEntries((r.list || []) as DepreciationEntryRow[])
        setEntriesTotal(r.totalAmount || 0)
      })
      .catch(() => {
        setEntries([])
        setEntriesTotal(0)
      })
      .finally(() => setLoading(false))
  }, [yearMonth, storeFilter])

  React.useEffect(() => {
    loadAssets()
    loadDisposedAssets()
  }, [loadAssets, loadDisposedAssets])

  React.useEffect(() => {
    getAccountSubjects({ excludeHeaders: true })
      .then((rows) => setAccountSubjects(rows || []))
      .catch(() => setAccountSubjects([]))
  }, [])

  const handleRunDepreciation = async (dryRun: boolean) => {
    setRunning(true)
    try {
      const res = await runDepreciation({
        yearMonth,
        storeFilter: storeFilter !== "All" ? storeFilter : undefined,
        dryRun,
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || (dryRun ? tt("deprPreviewDone", "Preview completed") : tt("deprPostingDone", "Journal posting completed")))
        if (!dryRun) {
          loadEntries()
          loadAssets()
        }
      } else {
        await appAlert(`${tt("msg_error_prefix", "Error: ")}${(res as { error?: string }).error || ""}`)
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setRunning(false)
    }
  }

  const handleSaveAsset = async () => {
    if (!form.name.trim()) {
      await appAlert(tt("deprAssetNameRequired", "Please enter asset name."))
      return
    }
    if (!form.acquisitionDate || !/^\d{4}-\d{2}-\d{2}$/.test(form.acquisitionDate)) {
      await appAlert(tt("deprAcquisitionDateRequired", "Please enter acquisition date (YYYY-MM-DD)."))
      return
    }
    const cost = Number(String(form.acquisitionCost).replace(/,/g, ""))
    if (isNaN(cost) || cost < 0) {
      await appAlert(tt("deprAcquisitionCostRequired", "Please enter acquisition cost."))
      return
    }
    setSaving(true)
    try {
      const res = await saveFixedAsset({
        id: editingId ?? undefined,
        assetCode: form.assetCode.trim() || undefined,
        name: form.name.trim(),
        storeName: form.storeName || "All",
        acquisitionDate: form.acquisitionDate,
        acquisitionCost: cost,
        residualRate: Number(form.residualRate) || 0,
        usefulLifeMonths: Number(form.usefulLifeMonths) || 60,
        assetAccountCode: form.assetAccountCode,
        accumulatedDepreciationAccountCode: form.accumulatedDepreciationAccountCode,
        depreciationExpenseAccountCode: form.depreciationExpenseAccountCode,
        memo: form.memo.trim() || undefined,
      })
      if (res.success) {
        setEditingId(null)
        setForm({
          assetCode: "",
          name: "",
          storeName: "All",
          acquisitionDate: "",
          acquisitionCost: "",
          residualRate: "0",
          usefulLifeMonths: "60",
          assetAccountCode: "1460",
          accumulatedDepreciationAccountCode: "1470",
          depreciationExpenseAccountCode: "5500",
          memo: "",
        })
        loadAssets()
        loadDisposedAssets()
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || tt("msg_save_fail", "Save failed"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDisposeAsset = async (asset: FixedAssetRow) => {
    const id = Number(asset.id || 0)
    if (!id) return
    const ok = await appConfirm({
      title: tt("dep_disposeConfirmTitle", "Dispose Asset"),
      description: `${asset.name || tt("dep_thisAsset", "this asset")}${tt("dep_disposeConfirmQuestion", " - proceed with disposal?")}`,
      confirmText: tt("dep_dispose", "Dispose"),
      cancelText: t("cancel"),
    })
    if (!ok) return
    setStatusUpdating(true)
    try {
      const proceeds = Math.max(0, Number(String(disposalProceeds).replace(/,/g, "")) || 0)
      const res = await setFixedAssetStatus({
        id,
        action: "dispose",
        disposedAt: disposeDate,
        disposalProceeds: proceeds,
        disposalGainAccountCode,
        disposalLossAccountCode,
        memo: disposalMemo.trim() || asset.memo || undefined,
      })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || tt("dep_disposeFailed", "Failed to process disposal."))
      }
      loadAssets()
      loadDisposedAssets()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setStatusUpdating(false)
    }
  }

  const handleRestoreAsset = async (asset: FixedAssetRow) => {
    const id = Number(asset.id || 0)
    if (!id) return
    const ok = await appConfirm({
      title: tt("dep_restoreConfirmTitle", "Restore Asset"),
      description: `${asset.name || tt("dep_thisAsset", "this asset")}${tt("dep_restoreConfirmQuestion", " - restore to active assets?")}`,
      confirmText: tt("dep_restore", "Restore"),
      cancelText: t("cancel"),
    })
    if (!ok) return
    setStatusUpdating(true)
    try {
      const res = await setFixedAssetStatus({ id, action: "restore", memo: asset.memo || undefined })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || tt("dep_restoreFailed", "Failed to restore asset."))
      }
      loadAssets()
      loadDisposedAssets()
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setStatusUpdating(false)
    }
  }

  const formatBaht = (n: number) => `฿${(n ?? 0).toLocaleString()}`

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <Tabs defaultValue="assets">
            <AdminTabsBarWithHelp>
              <TabsList className={adminTabsListRowCn}>
                  <TabsTrigger value="assets" className={adminTabsTriggerCn}>
                    {tt("dep_assetLedgerTab", "Asset Ledger")}
                  </TabsTrigger>
                  <TabsTrigger value="depreciation" className={adminTabsTriggerCn}>
                    {t("dep_runDepreciation")}
                  </TabsTrigger>
                  <TabsTrigger value="disposal" className={adminTabsTriggerCn}>
                    {tt("dep_disposalTab", "Asset Disposal")}
                  </TabsTrigger>
                </TabsList>
          </AdminTabsBarWithHelp>

            <TabsContent value="assets" className={cn(adminTabsContentFlushCn, "space-y-4 pt-4")}>
              <div className="flex flex-wrap items-center gap-3">
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOptions.map((s) => (
                      <SelectItem key={s} value={s}>{storeOptionLabel(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={loadAssets} disabled={loading}>
                  <Search className="h-4 w-4 mr-1" />
                  {t("btn_query")}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                {tt("dep_assetLedgerDesc", "Register or edit assets. Journal accounts are controlled by asset/accumulated depreciation/depreciation expense mappings.")}
              </div>

              <div className="border rounded-lg p-4 space-y-3">
                <div className="text-sm font-medium">{t("dep_assetForm")}</div>
                <div className="grid gap-2 grid-cols-2 md:grid-cols-4">
                  <Input
                    placeholder={t("dep_assetCode")}
                    value={form.assetCode}
                    onChange={(e) => setForm((f) => ({ ...f, assetCode: e.target.value }))}
                  />
                  <Input
                    placeholder={`${t("dep_assetName")} *`}
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                  <Select value={form.storeName} onValueChange={(v) => setForm((f) => ({ ...f, storeName: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {storeOptions.map((s) => (
                        <SelectItem key={s} value={s}>{storeOptionLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    placeholder={t("dep_acquisitionDate")}
                    value={form.acquisitionDate}
                    onChange={(e) => setForm((f) => ({ ...f, acquisitionDate: e.target.value }))}
                  />
                  <Input
                    placeholder={t("dep_acquisitionCost")}
                    value={form.acquisitionCost}
                    onChange={(e) => setForm((f) => ({ ...f, acquisitionCost: e.target.value }))}
                  />
                  <Input
                    placeholder={t("dep_residualRate")}
                    value={form.residualRate}
                    onChange={(e) => setForm((f) => ({ ...f, residualRate: e.target.value }))}
                  />
                  <Input
                    placeholder={t("dep_usefulLifeMonths")}
                    value={form.usefulLifeMonths}
                    onChange={(e) => setForm((f) => ({ ...f, usefulLifeMonths: e.target.value }))}
                  />
                  <Select
                    value={form.assetAccountCode}
                    onValueChange={(v) => setForm((f) => ({ ...f, assetAccountCode: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tt("dep_assetAccountCode", "Asset account code")} />
                    </SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((a) => (
                        <SelectItem key={`asset-${a.code}`} value={String(a.code)}>
                          {String(a.code)} · {accountSubjectDisplayName(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={form.accumulatedDepreciationAccountCode}
                    onValueChange={(v) => setForm((f) => ({ ...f, accumulatedDepreciationAccountCode: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tt("dep_accumDepAccountCode", "Accumulated depreciation account code")} />
                    </SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((a) => (
                        <SelectItem key={`accum-${a.code}`} value={String(a.code)}>
                          {String(a.code)} · {accountSubjectDisplayName(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={form.depreciationExpenseAccountCode}
                    onValueChange={(v) => setForm((f) => ({ ...f, depreciationExpenseAccountCode: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={tt("dep_expenseAccountCode", "Depreciation expense account code")} />
                    </SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((a) => (
                        <SelectItem key={`exp-${a.code}`} value={String(a.code)}>
                          {String(a.code)} · {accountSubjectDisplayName(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveAsset} disabled={saving}>
                    <Plus className="h-4 w-4 mr-1" />
                    {editingId ? t("dep_edit") : t("dep_register")}
                  </Button>
                  {editingId && (
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                      {t("cancel")}
                    </Button>
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-left">{t("dep_code")}</th>
                      <th className="py-2 text-left">{t("dep_assetName")}</th>
                      <th className="py-2 text-left">{t("pL_store")}</th>
                      <th className="py-2 text-right">{t("dep_acquisitionDate")}</th>
                      <th className="py-2 text-right">{t("dep_acquisitionCost")}</th>
                      <th className="py-2 text-right">{t("dep_usefulLifeMonths")}</th>
                      <th className="py-2 text-left">{tt("dep_accountMapping", "Account Mapping")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.map((a) => (
                      <tr key={a.id} className="border-b">
                        <td className="py-2">{a.asset_code}</td>
                        <td className="py-2">{a.name}</td>
                        <td className="py-2">{a.store_name}</td>
                        <td className="py-2 text-right">{a.acquisition_date}</td>
                        <td className="py-2 text-right font-mono">{formatBaht(a.acquisition_cost ?? 0)}</td>
                        <td className="py-2 text-right">{a.useful_life_months} {t("dep_months")}</td>
                        <td className="py-2 text-xs">
                          <div>{labelByCode(String(a.asset_account_code || ""), "1460")}</div>
                          <div className="text-muted-foreground">{labelByCode(String(a.accumulated_depreciation_account_code || ""), "1470")}</div>
                          <div className="text-muted-foreground">{labelByCode(String(a.depreciation_expense_account_code || ""), "5500")}</div>
                        </td>
                        <td>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(a.id ?? null)
                              setForm({
                                assetCode: a.asset_code || "",
                                name: a.name || "",
                                storeName: a.store_name || "All",
                                acquisitionDate: a.acquisition_date || "",
                                acquisitionCost: String(a.acquisition_cost ?? ""),
                                residualRate: "0",
                                usefulLifeMonths: String(a.useful_life_months ?? 60),
                                assetAccountCode: String(a.asset_account_code || "1460"),
                                accumulatedDepreciationAccountCode: String(a.accumulated_depreciation_account_code || "1470"),
                                depreciationExpenseAccountCode: String(a.depreciation_expense_account_code || "5500"),
                                memo: "",
                              })
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!loading && assets.length === 0 && (
                  <p className="py-4 text-center text-muted-foreground text-sm">{t("dep_noAssets")}</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="depreciation" className={cn(adminTabsContentFlushCn, "space-y-4 pt-4")}>
              <div className="flex flex-wrap items-center gap-3">
                <Select value={yearMonth} onValueChange={setYearMonth}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearMonthOptions.map((ym) => (
                      <SelectItem key={ym} value={ym}>{ym}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOptions.map((s) => (
                      <SelectItem key={s} value={s}>{storeOptionLabel(s)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={loadEntries} disabled={loading}>
                  <Search className="h-4 w-4 mr-1" />
                  {t("dep_queryEntries")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRunDepreciation(true)}
                  disabled={running}
                >
                  <Calculator className="h-4 w-4 mr-1" />
                  {t("dep_preview")}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleRunDepreciation(false)}
                  disabled={running}
                >
                  {t("dep_runWithPosting")}
                </Button>
              </div>

              <div className="text-sm text-muted-foreground">
                {yearMonth} {t("dep_entriesTotal")}: <span className="font-mono font-medium">{formatBaht(entriesTotal)}</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 text-left">{t("dep_assetCol")}</th>
                      <th className="py-2 text-left">{t("pL_store")}</th>
                      <th className="py-2 text-right">{t("dep_depreciationDate")}</th>
                      <th className="py-2 text-right">{t("dep_amount")}</th>
                      <th className="py-2 text-center">{t("dep_journalEntry")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e, i) => (
                      <tr key={i} className="border-b">
                        <td className="py-2">{e.assetName}</td>
                        <td className="py-2">{e.storeName}</td>
                        <td className="py-2 text-right">{e.accounting_date}</td>
                        <td className="py-2 text-right font-mono">{formatBaht(e.amount ?? 0)}</td>
                        <td className="py-2 text-center">{e.journal_entry_id ? "O" : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!loading && entries.length === 0 && (
                  <p className="py-4 text-center text-muted-foreground text-sm">{t("dep_noEntries")}</p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="disposal" className={cn(adminTabsContentFlushCn, "space-y-4 pt-4")}>
              <div className="flex flex-wrap items-end gap-3">
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {storeOptionLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">{tt("dep_disposalDate", "Disposal Date")}</div>
                  <Input type="date" value={disposeDate} onChange={(e) => setDisposeDate(e.target.value)} className="w-[170px]" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">{tt("dep_disposalProceeds", "Disposal Proceeds")}</div>
                  <Input
                    className="w-[160px]"
                    placeholder="0"
                    value={disposalProceeds}
                    onChange={(e) => setDisposalProceeds(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">{tt("dep_disposalGainAccount", "Disposal Gain Account")}</div>
                  <Select value={disposalGainAccountCode} onValueChange={setDisposalGainAccountCode}>
                    <SelectTrigger className="w-[210px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((a) => (
                        <SelectItem key={`gain-${a.code}`} value={String(a.code)}>
                          {String(a.code)} · {accountSubjectDisplayName(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">{tt("dep_disposalLossAccount", "Disposal Loss Account")}</div>
                  <Select value={disposalLossAccountCode} onValueChange={setDisposalLossAccountCode}>
                    <SelectTrigger className="w-[210px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((a) => (
                        <SelectItem key={`loss-${a.code}`} value={String(a.code)}>
                          {String(a.code)} · {accountSubjectDisplayName(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">{tt("dep_disposalMemoOptional", "Disposal Memo (Optional)")}</div>
                  <Input
                    className="w-[240px]"
                    value={disposalMemo}
                    onChange={(e) => setDisposalMemo(e.target.value)}
                    placeholder={tt("dep_autoPostingMemo", "Auto-posting memo")}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    loadAssets()
                    loadDisposedAssets()
                  }}
                  disabled={loading}
                >
                  <Search className="h-4 w-4 mr-1" />
                  {tt("dep_refreshList", "Refresh List")}
                </Button>
              </div>

              <Card>
                <CardContent className="pt-4 space-y-2">
                  <div className="text-sm font-medium">{tt("dep_activeAssetsDisposable", "Active Assets (Disposal Available)")}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 text-left">{t("dep_code")}</th>
                          <th className="py-2 text-left">{t("dep_assetName")}</th>
                          <th className="py-2 text-left">{t("pL_store")}</th>
                          <th className="py-2 text-right">{t("dep_acquisitionCost")}</th>
                          <th className="py-2 text-left">{tt("dep_mappingAccount", "Mapped Account")}</th>
                          <th className="py-2 text-right">{t("actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {assets.map((a) => (
                          <tr key={`active-${a.id}`} className="border-b">
                            <td className="py-2">{a.asset_code}</td>
                            <td className="py-2">{a.name}</td>
                            <td className="py-2">{a.store_name}</td>
                            <td className="py-2 text-right font-mono">{formatBaht(Number(a.acquisition_cost || 0))}</td>
                            <td className="py-2 text-xs">
                              <div>{labelByCode(String(a.asset_account_code || ""), "1460")}</div>
                              <div className="text-muted-foreground">{labelByCode(String(a.accumulated_depreciation_account_code || ""), "1470")}</div>
                            </td>
                            <td className="py-2 text-right">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => void handleDisposeAsset(a)}
                                disabled={statusUpdating}
                              >
                                <Trash2 className="h-4 w-4 mr-1" />
                                {tt("dep_dispose", "Dispose")}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!loading && assets.length === 0 ? (
                      <div className="py-4 text-center text-muted-foreground text-sm">{tt("dep_noDisposableAssets", "No active assets available for disposal.")}</div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 space-y-2">
                  <div className="text-sm font-medium">{tt("dep_disposedAssetsRestorable", "Disposed Assets (Restorable)")}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 text-left">{t("dep_code")}</th>
                          <th className="py-2 text-left">{t("dep_assetName")}</th>
                          <th className="py-2 text-left">{t("pL_store")}</th>
                          <th className="py-2 text-right">{tt("dep_disposedDate", "Disposed Date")}</th>
                          <th className="py-2 text-right">{tt("dep_disposalPrice", "Disposal Price")}</th>
                          <th className="py-2 text-right">{tt("dep_disposalGainLoss", "Disposal Gain/Loss")}</th>
                          <th className="py-2 text-center">{t("dep_journalEntry")}</th>
                          <th className="py-2 text-right">{t("actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {disposedAssets.map((a) => (
                          <tr key={`disposed-${a.id}`} className="border-b">
                            <td className="py-2">{a.asset_code}</td>
                            <td className="py-2">{a.name}</td>
                            <td className="py-2">{a.store_name}</td>
                            <td className="py-2 text-right">{String(a.disposed_at || "-")}</td>
                            <td className="py-2 text-right font-mono">{formatBaht(Number(a.disposed_proceeds || 0))}</td>
                            <td className="py-2 text-right font-mono">{formatBaht(Number(a.disposal_gain_loss_amount || 0))}</td>
                            <td className="py-2 text-center">{a.disposal_journal_entry_id ? "O" : "-"}</td>
                            <td className="py-2 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void handleRestoreAsset(a)}
                                disabled={statusUpdating}
                              >
                                <RotateCcw className="h-4 w-4 mr-1" />
                                {tt("dep_restore", "Restore")}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!loading && disposedAssets.length === 0 ? (
                      <div className="py-4 text-center text-muted-foreground text-sm">{tt("dep_noDisposedAssets", "No disposed assets.")}</div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
