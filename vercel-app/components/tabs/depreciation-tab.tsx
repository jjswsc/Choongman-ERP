"use client"
import { appAlert } from "@/lib/app-message"

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
import { Search, Plus, Pencil, Calculator } from "lucide-react"
import { useStoreList } from "@/lib/api-client"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isOfficeRole } from "@/lib/permissions"
import {
  getFixedAssets,
  saveFixedAsset,
  getDepreciationEntries,
  runDepreciation,
} from "@/lib/api-client"
import { translateApiMessage } from "@/lib/translate-api-message"
import { getBangkokRecentYearMonths } from "@/lib/bangkok-time"

const OFFICE_STORES = ["본사", "Office", "오피스", "본점"]

export function DepreciationTab() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const tt = React.useCallback((key: string, fallback: string) => {
    const v = t(key)
    if (!v || v === key) return fallback
    return v
  }, [t])
  const { stores: storeList } = useStoreList()
  const isOffice = isOfficeRole(auth?.role || "")

  const [storeFilter, setStoreFilter] = React.useState("All")
  const [yearMonth, setYearMonth] = React.useState(() => getBangkokRecentYearMonths(1)[0])

  const [assets, setAssets] = React.useState<unknown[]>([])
  const [entries, setEntries] = React.useState<unknown[]>([])
  const [entriesTotal, setEntriesTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [running, setRunning] = React.useState(false)

  const [editingId, setEditingId] = React.useState<number | null>(null)
  const [form, setForm] = React.useState({
    assetCode: "",
    name: "",
    storeName: "All",
    acquisitionDate: "",
    acquisitionCost: "",
    residualRate: "0",
    usefulLifeMonths: "60",
    memo: "",
  })
  const [saving, setSaving] = React.useState(false)

  const storeOptions = isOffice
    ? ["All", "본사", ...(storeList || []).filter((s) => !OFFICE_STORES.includes(s) && !s.toLowerCase().includes("office"))]
    : [auth?.store || "All"]

  const yearMonthOptions = getBangkokRecentYearMonths(24)

  const loadAssets = React.useCallback(() => {
    setLoading(true)
    getFixedAssets({ storeFilter: storeFilter !== "All" ? storeFilter : undefined, status: "active" })
      .then((r) => setAssets(r.list || []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false))
  }, [storeFilter])

  const loadEntries = React.useCallback(() => {
    setLoading(true)
    getDepreciationEntries({
      yearMonth,
      storeFilter: storeFilter !== "All" ? storeFilter : undefined,
    })
      .then((r) => {
        setEntries(r.list || [])
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
  }, [loadAssets])

  const handleRunDepreciation = async (dryRun: boolean) => {
    setRunning(true)
    try {
      const res = await runDepreciation({
        yearMonth,
        storeFilter: storeFilter !== "All" ? storeFilter : undefined,
        dryRun,
      })
      if (res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || (dryRun ? tt("deprPreviewDone", "미리보기 완료") : tt("deprPostingDone", "분개 완료")))
        if (!dryRun) loadEntries()
      } else {
        await appAlert(`${tt("msg_error_prefix", "오류: ")}${(res as { error?: string }).error || ""}`)
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setRunning(false)
    }
  }

  const handleSaveAsset = async () => {
    if (!form.name.trim()) {
      await appAlert(tt("deprAssetNameRequired", "자산명을 입력하세요."))
      return
    }
    if (!form.acquisitionDate || !/^\d{4}-\d{2}-\d{2}$/.test(form.acquisitionDate)) {
      await appAlert(tt("deprAcquisitionDateRequired", "취득일을 입력하세요 (YYYY-MM-DD)."))
      return
    }
    const cost = Number(String(form.acquisitionCost).replace(/,/g, ""))
    if (isNaN(cost) || cost < 0) {
      await appAlert(tt("deprAcquisitionCostRequired", "취득가를 입력하세요."))
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
          memo: "",
        })
        loadAssets()
      } else {
        await appAlert(translateApiMessage(res.message, t) || res.message || tt("msg_save_fail", "저장 실패"))
      }
    } catch (e) {
      await appAlert(String(e))
    } finally {
      setSaving(false)
    }
  }

  const formatBaht = (n: number) => `฿${(n ?? 0).toLocaleString()}`

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <Tabs defaultValue="assets">
            <div className={adminTabsBarCn}>
              <div className={adminTabsScrollCn}>
                <TabsList className={adminTabsListRowCn}>
                  <TabsTrigger value="assets" className={adminTabsTriggerCn}>
                    고정자산
                  </TabsTrigger>
                  <TabsTrigger value="depreciation" className={adminTabsTriggerCn}>
                    감가상각 실행
                  </TabsTrigger>
                </TabsList>
              </div>
            </div>

            <TabsContent value="assets" className={cn(adminTabsContentFlushCn, "space-y-4 pt-4")}>
              <div className="flex flex-wrap items-center gap-3">
                <Select value={storeFilter} onValueChange={setStoreFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {storeOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" onClick={loadAssets} disabled={loading}>
                  <Search className="h-4 w-4 mr-1" />
                  {t("btn_query")}
                </Button>
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
                        <SelectItem key={s} value={s}>{s}</SelectItem>
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
                    placeholder="취득가 (฿)"
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
                    </tr>
                  </thead>
                  <tbody>
                    {(assets as { id?: number; asset_code?: string; name?: string; store_name?: string; acquisition_date?: string; acquisition_cost?: number; useful_life_months?: number }[]).map((a) => (
                      <tr key={a.id} className="border-b">
                        <td className="py-2">{a.asset_code}</td>
                        <td className="py-2">{a.name}</td>
                        <td className="py-2">{a.store_name}</td>
                        <td className="py-2 text-right">{a.acquisition_date}</td>
                        <td className="py-2 text-right font-mono">{formatBaht(a.acquisition_cost ?? 0)}</td>
                        <td className="py-2 text-right">{a.useful_life_months} {t("dep_months")}</td>
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
                  <p className="py-4 text-center text-muted-foreground text-sm">등록된 고정자산이 없습니다.</p>
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
                      <SelectItem key={s} value={s}>{s}</SelectItem>
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
                  감가상각 실행 (자동분개)
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
                    {(entries as { assetName?: string; storeName?: string; accounting_date?: string; amount?: number; journal_entry_id?: number }[]).map((e, i) => (
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
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
