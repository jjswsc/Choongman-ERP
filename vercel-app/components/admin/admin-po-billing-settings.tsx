"use client"

import * as React from "react"
import { appAlert } from "@/lib/app-message"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getPoBillingRateHistory,
  getPoBillingSettings,
  savePoBillingSettings,
  type PoBillingRateHistoryApiRow,
} from "@/lib/api-client"
import { getBangkokDateStr } from "@/lib/pos-business-day"
import { useStoreList } from "@/lib/use-store-list"
import { ChevronDown, ChevronRight, Loader2, RefreshCw } from "lucide-react"

type RowVals = { royalty_pct: number; delivery_gp_pct: number; grab_gp_pct: number }

function buildDraft(
  storeRows: string[],
  apiList: {
    store_name?: string
    royalty_pct?: number
    delivery_gp_pct?: number
    grab_gp_pct?: number
  }[]
): Record<string, RowVals> {
  const map = new Map(
    (apiList || []).map((r) => [String(r.store_name || "").trim(), r] as const)
  )
  const out: Record<string, RowVals> = {}
  for (const s of storeRows) {
    const r = map.get(s)
    out[s] = {
      royalty_pct: Number(r?.royalty_pct) || 0,
      delivery_gp_pct: Number(r?.delivery_gp_pct) || 0,
      grab_gp_pct: Number(r?.grab_gp_pct) || 0,
    }
  }
  return out
}

function formatCreatedAt(iso: string | null | undefined): string {
  if (!iso) return "—"
  try {
    return new Date(iso).toLocaleString("en-CA", { timeZone: "Asia/Bangkok", hour12: false })
  } catch {
    return String(iso).slice(0, 19)
  }
}

export function AdminPoBillingSettings() {
  const { lang } = useLang()
  const t = useT(lang)
  const { stores } = useStoreList()
  const storeRows = React.useMemo(
    () => (stores || []).filter((s) => s && s !== "All" && s !== "전체"),
    [stores]
  )

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [apiList, setApiList] = React.useState<
    {
      store_name?: string
      royalty_pct?: number
      delivery_gp_pct?: number
      grab_gp_pct?: number
      effective_from?: string | null
    }[]
  >([])
  const [draft, setDraft] = React.useState<Record<string, RowVals>>({})
  const [effectiveFrom, setEffectiveFrom] = React.useState(() => getBangkokDateStr())
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [historyStore, setHistoryStore] = React.useState("")
  const [history, setHistory] = React.useState<PoBillingRateHistoryApiRow[]>([])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await getPoBillingSettings()
      if (res.success && Array.isArray(res.list)) setApiList(res.list)
      else setApiList([])
    } catch {
      setApiList([])
    } finally {
      setLoading(false)
    }
  }, [])

  const loadHistory = React.useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await getPoBillingRateHistory(historyStore || undefined)
      if (res.success && Array.isArray(res.list)) setHistory(res.list)
      else setHistory([])
    } catch {
      setHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }, [historyStore])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (loading) return
    setDraft(buildDraft(storeRows, apiList))
  }, [loading, storeRows, apiList])

  React.useEffect(() => {
    if (!historyOpen) return
    void loadHistory()
  }, [historyOpen, loadHistory])

  const updateCell = (store: string, field: keyof RowVals, raw: string) => {
    const n = Math.min(100, Math.max(0, Number(String(raw).replace(/,/g, "")) || 0))
    setDraft((prev) => ({
      ...prev,
      [store]: { ...(prev[store] || { royalty_pct: 0, delivery_gp_pct: 0, grab_gp_pct: 0 }), [field]: n },
    }))
  }

  const handleSave = async () => {
    const from = String(effectiveFrom || "").trim().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) {
      await appAlert(t("poBillingEffectiveFromInvalid"))
      return
    }
    setSaving(true)
    try {
      const rows = storeRows.map((store_name) => ({
        store_name,
        ...(draft[store_name] || { royalty_pct: 0, delivery_gp_pct: 0, grab_gp_pct: 0 }),
      }))
      const res = await savePoBillingSettings(rows, from)
      if (res.success) {
        await appAlert(t("poBillingSettingsSaved"))
        await load()
        if (historyOpen) await loadHistory()
      } else {
        await appAlert(res.message || "Save failed")
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : "Save failed")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <div>
          <CardTitle className="text-base">{t("poBillingSettingsTitle")}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">{t("poBillingSettingsHint")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("poBillingEffectiveFromHint")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            <span>{t("poBillingEffectiveFrom")}</span>
            <Input
              type="date"
              className="h-8 w-[10.5rem]"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </label>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("poBillingReload")}
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={saving || loading || !storeRows.length}>
            {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            {t("poBillingSaveSettings")}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-0 sm:p-4">
        {loading ? (
          <div className="flex justify-center py-12 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            …
          </div>
        ) : storeRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">—</p>
        ) : (
          <div className="max-h-[min(70vh,720px)] overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="min-w-[8rem]">{t("pay_col_store")}</TableHead>
                  <TableHead className="w-28 text-right">{t("poBillingColRoyalty")}</TableHead>
                  <TableHead className="w-28 text-right">{t("poBillingColDelGp")}</TableHead>
                  <TableHead className="w-28 text-right">{t("poBillingColGrabGp")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {storeRows.map((s) => {
                  const v = draft[s] || { royalty_pct: 0, delivery_gp_pct: 0, grab_gp_pct: 0 }
                  return (
                    <TableRow key={s}>
                      <TableCell className="font-medium">{s}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="ml-auto h-8 w-24 text-right"
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={v.royalty_pct}
                          onChange={(e) => updateCell(s, "royalty_pct", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="ml-auto h-8 w-24 text-right"
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={v.delivery_gp_pct}
                          onChange={(e) => updateCell(s, "delivery_gp_pct", e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          className="ml-auto h-8 w-24 text-right"
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={v.grab_gp_pct}
                          onChange={(e) => updateCell(s, "grab_gp_pct", e.target.value)}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="rounded-md border border-border">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/40"
            onClick={() => setHistoryOpen((o) => !o)}
          >
            {historyOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {t("poBillingHistoryTitle")}
          </button>
          {historyOpen ? (
            <div className="space-y-2 border-t border-border p-3">
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                  <span>{t("pay_col_store")}</span>
                  <select
                    className="h-8 min-w-[10rem] rounded-md border border-input bg-background px-2 text-sm"
                    value={historyStore}
                    onChange={(e) => setHistoryStore(e.target.value)}
                  >
                    <option value="">{t("poBillingHistoryAllStores")}</option>
                    {storeRows.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void loadHistory()}
                  disabled={historyLoading}
                >
                  {historyLoading ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {t("poBillingReload")}
                </Button>
              </div>
              {historyLoading ? (
                <div className="flex justify-center py-6 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  …
                </div>
              ) : history.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">{t("poBillingHistoryEmpty")}</p>
              ) : (
                <div className="max-h-[min(40vh,360px)] overflow-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>{t("pay_col_store")}</TableHead>
                        <TableHead>{t("poBillingEffectiveFrom")}</TableHead>
                        <TableHead className="text-right">{t("poBillingColRoyalty")}</TableHead>
                        <TableHead className="text-right">{t("poBillingColDelGp")}</TableHead>
                        <TableHead className="text-right">{t("poBillingColGrabGp")}</TableHead>
                        <TableHead>{t("poBillingHistorySavedAt")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.map((h) => (
                        <TableRow key={`${h.store_name}-${h.effective_from}-${h.id || h.created_at || ""}`}>
                          <TableCell className="font-medium">{h.store_name}</TableCell>
                          <TableCell>{h.effective_from}</TableCell>
                          <TableCell className="text-right">{h.royalty_pct}</TableCell>
                          <TableCell className="text-right">{h.delivery_gp_pct}</TableCell>
                          <TableCell className="text-right">{h.grab_gp_pct}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatCreatedAt(h.created_at)}
                            {h.created_by ? ` · ${h.created_by}` : ""}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}
