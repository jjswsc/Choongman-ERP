"use client"
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
  const accountOptions = React.useMemo(() => {
    const uniq = new Map<string, AccountSubjectItem>()
    const defaults: AccountSubjectItem[] = [
      { code: "1460", name: "고정자산", type: "asset", sortOrder: 0 },
      { code: "1470", name: "감가상각누계액", type: "asset", sortOrder: 0 },
      { code: "5500", name: "감가상각비", type: "expense", sortOrder: 0 },
      { code: "4110", name: "매출", type: "revenue", sortOrder: 0 },
      { code: "5520", name: "일반관리비", type: "expense", sortOrder: 0 },
    ]
    for (const d of defaults) uniq.set(d.code, d)
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
      return hit ? `${c} · ${hit.name}` : c
    },
    [accountOptions]
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
        await appAlert(translateApiMessage(res.message, t) || res.message || (dryRun ? tt("deprPreviewDone", "미리보기 완료") : tt("deprPostingDone", "분개 완료")))
        if (!dryRun) {
          loadEntries()
          loadAssets()
        }
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
        await appAlert(translateApiMessage(res.message, t) || res.message || tt("msg_save_fail", "저장 실패"))
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
      title: "자산 처분 처리",
      description: `${asset.name || "해당 자산"}을(를) 처분 처리하시겠습니까?`,
      confirmText: "처분 처리",
      cancelText: "취소",
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
        await appAlert(translateApiMessage(res.message, t) || res.message || "처분 처리에 실패했습니다.")
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
      title: "자산 복구",
      description: `${asset.name || "해당 자산"}을(를) 활성 자산으로 복구할까요?`,
      confirmText: "복구",
      cancelText: "취소",
    })
    if (!ok) return
    setStatusUpdating(true)
    try {
      const res = await setFixedAssetStatus({ id, action: "restore", memo: asset.memo || undefined })
      if (!res.success) {
        await appAlert(translateApiMessage(res.message, t) || res.message || "자산 복구에 실패했습니다.")
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
            <div className={adminTabsBarCn}>
              <div className={adminTabsScrollCn}>
                <TabsList className={adminTabsListRowCn}>
                  <TabsTrigger value="assets" className={adminTabsTriggerCn}>
                    자산대장
                  </TabsTrigger>
                  <TabsTrigger value="depreciation" className={adminTabsTriggerCn}>
                    감가상각 실행
                  </TabsTrigger>
                  <TabsTrigger value="disposal" className={adminTabsTriggerCn}>
                    자산처분
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
              <div className="text-xs text-muted-foreground">
                자산대장 등록/수정 화면입니다. 자산/감가상각누계액/감가상각비 계정 매핑으로 분개 계정을 제어합니다.
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
                  <Select
                    value={form.assetAccountCode}
                    onValueChange={(v) => setForm((f) => ({ ...f, assetAccountCode: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="자산 계정코드" />
                    </SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((a) => (
                        <SelectItem key={`asset-${a.code}`} value={String(a.code)}>
                          {String(a.code)} · {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={form.accumulatedDepreciationAccountCode}
                    onValueChange={(v) => setForm((f) => ({ ...f, accumulatedDepreciationAccountCode: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="감가상각누계액 계정코드" />
                    </SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((a) => (
                        <SelectItem key={`accum-${a.code}`} value={String(a.code)}>
                          {String(a.code)} · {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={form.depreciationExpenseAccountCode}
                    onValueChange={(v) => setForm((f) => ({ ...f, depreciationExpenseAccountCode: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="감가상각비 계정코드" />
                    </SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((a) => (
                        <SelectItem key={`exp-${a.code}`} value={String(a.code)}>
                          {String(a.code)} · {a.name}
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
                      <th className="py-2 text-left">계정 매핑</th>
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
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">처분일</div>
                  <Input type="date" value={disposeDate} onChange={(e) => setDisposeDate(e.target.value)} className="w-[170px]" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">처분가(입금액)</div>
                  <Input
                    className="w-[160px]"
                    placeholder="0"
                    value={disposalProceeds}
                    onChange={(e) => setDisposalProceeds(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">처분이익 계정</div>
                  <Select value={disposalGainAccountCode} onValueChange={setDisposalGainAccountCode}>
                    <SelectTrigger className="w-[210px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((a) => (
                        <SelectItem key={`gain-${a.code}`} value={String(a.code)}>
                          {String(a.code)} · {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">처분손실 계정</div>
                  <Select value={disposalLossAccountCode} onValueChange={setDisposalLossAccountCode}>
                    <SelectTrigger className="w-[210px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accountOptions.map((a) => (
                        <SelectItem key={`loss-${a.code}`} value={String(a.code)}>
                          {String(a.code)} · {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">처분 메모(선택)</div>
                  <Input
                    className="w-[240px]"
                    value={disposalMemo}
                    onChange={(e) => setDisposalMemo(e.target.value)}
                    placeholder="자동분개 메모"
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
                  목록 새로고침
                </Button>
              </div>

              <Card>
                <CardContent className="pt-4 space-y-2">
                  <div className="text-sm font-medium">활성 자산 (처분 가능)</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 text-left">{t("dep_code")}</th>
                          <th className="py-2 text-left">{t("dep_assetName")}</th>
                          <th className="py-2 text-left">{t("pL_store")}</th>
                          <th className="py-2 text-right">{t("dep_acquisitionCost")}</th>
                          <th className="py-2 text-left">매핑계정</th>
                          <th className="py-2 text-right">작업</th>
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
                                처분
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!loading && assets.length === 0 ? (
                      <div className="py-4 text-center text-muted-foreground text-sm">처분 가능한 활성 자산이 없습니다.</div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 space-y-2">
                  <div className="text-sm font-medium">처분 자산 (복구 가능)</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 text-left">{t("dep_code")}</th>
                          <th className="py-2 text-left">{t("dep_assetName")}</th>
                          <th className="py-2 text-left">{t("pL_store")}</th>
                          <th className="py-2 text-right">처분일</th>
                          <th className="py-2 text-right">처분가</th>
                          <th className="py-2 text-right">처분손익</th>
                          <th className="py-2 text-center">분개</th>
                          <th className="py-2 text-right">작업</th>
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
                                복구
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!loading && disposedAssets.length === 0 ? (
                      <div className="py-4 text-center text-muted-foreground text-sm">처분된 자산이 없습니다.</div>
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
