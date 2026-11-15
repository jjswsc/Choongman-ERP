"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Gift, Plus, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList } from "@/lib/use-store-list"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import {
  getSalesBonusPreview,
  getSalesBonusSettings,
  saveSalesBonusSettings,
  type SalesBonusStorePreviewDto,
  type SalesBonusTierDto,
  type StoreSalesBonusSettingsDto,
} from "@/lib/api-client/hr-sales-bonus"
import { HelpSumHowBlocks } from "@/components/erp/help-sum-how-blocks"
import { hrefToHelpSummaryKey } from "@/lib/admin-help-registry"

function currentPayrollMonthLabel(): string {
  const today = getBangkokTodayDateString()
  return today.slice(0, 7)
}

function fmtBaht(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

const emptySettings = (storeCode: string): StoreSalesBonusSettingsDto => ({
  storeCode,
  enabled: false,
  absencePenaltyPctPerDay: 5,
  managerMultiplier: 2,
  staffMultiplier: 1,
  tiers: [{ threshold: 500000, amount: 1000 }],
})

export function HrSalesBonusContent() {
  const { lang } = useLang()
  const t = useT(lang)
  const { stores, storeLabels, loading: storesLoading } = useStoreList()
  const [tab, setTab] = useState("settings")
  const [store, setStore] = useState("")
  const [settings, setSettings] = useState<StoreSalesBonusSettingsDto | null>(null)
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [saving, setSaving] = useState(false)
  const [month, setMonth] = useState(currentPayrollMonthLabel)
  const [preview, setPreview] = useState<SalesBonusStorePreviewDto | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [statusMsg, setStatusMsg] = useState("")

  const storeOptions = useMemo(() => {
    return (stores || []).filter((s) => {
      const lo = s.toLowerCase()
      return !/office|본사|오피스|hq|test/.test(lo)
    })
  }, [stores])

  useEffect(() => {
    if (!store && storeOptions.length > 0) setStore(storeOptions[0])
  }, [store, storeOptions])

  const loadSettings = useCallback(async (storeCode: string) => {
    if (!storeCode) return
    setLoadingSettings(true)
    setStatusMsg("")
    try {
      const res = await getSalesBonusSettings(storeCode)
      setSettings(res.settings || emptySettings(storeCode))
    } catch (e) {
      setSettings(emptySettings(storeCode))
      setStatusMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingSettings(false)
    }
  }, [])

  useEffect(() => {
    if (store) void loadSettings(store)
  }, [store, loadSettings])

  const updateTier = (tiers: SalesBonusTierDto[]) => {
    setSettings((prev) => (prev ? { ...prev, tiers } : prev))
  }

  const onSave = async () => {
    if (!settings || !store) return
    setSaving(true)
    setStatusMsg("")
    try {
      const saved = await saveSalesBonusSettings({ ...settings, storeCode: store })
      setSettings(saved)
      setStatusMsg(t("saved"))
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const onPreview = async () => {
    if (!store || !month) return
    setLoadingPreview(true)
    setStatusMsg("")
    try {
      const rows = await getSalesBonusPreview({ month, store })
      setPreview(rows[0] || null)
    } catch (e) {
      setPreview(null)
      setStatusMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingPreview(false)
    }
  }

  const labelOf = (code: string) => storeLabels?.[code] || code

  return (
    <div className="space-y-4">
      <HelpSumHowBlocks helpSumKey={hrefToHelpSummaryKey("/admin/hr-sales-bonus")} />

      {statusMsg ? (
        <p className="text-sm text-muted-foreground rounded-md border px-3 py-2">{statusMsg}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label>{t("hrSalesBonus_store")}</Label>
          <Select value={store} onValueChange={setStore} disabled={storesLoading}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder={storesLoading ? t("loading") : t("hrSalesBonus_store")} />
            </SelectTrigger>
            <SelectContent>
              {storeOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {labelOf(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="settings">{t("hrSalesBonus_tab_settings")}</TabsTrigger>
          <TabsTrigger value="preview">{t("hrSalesBonus_tab_preview")}</TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="space-y-4 pt-2">
          {loadingSettings || !settings ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("loading")}
            </div>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Gift className="h-4 w-4" />
                    {t("hrSalesBonus_tab_settings")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 cursor-pointer">
                    <div>
                      <p className="text-sm font-medium">{t("hrSalesBonus_enabled")}</p>
                      <p className="text-xs text-muted-foreground">{t("hrSalesBonus_enabled_hint")}</p>
                    </div>
                    <Checkbox
                      checked={settings.enabled}
                      onCheckedChange={(v) => setSettings({ ...settings, enabled: v === true })}
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>{t("hrSalesBonus_penalty_pct")}</Label>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        value={settings.absencePenaltyPctPerDay}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            absencePenaltyPctPerDay: Number(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("hrSalesBonus_mgr_mult")}</Label>
                      <Input
                        type="number"
                        min={0.1}
                        max={20}
                        step={0.1}
                        value={settings.managerMultiplier}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            managerMultiplier: Number(e.target.value) || 2,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{t("hrSalesBonus_staff_mult")}</Label>
                      <Input
                        type="number"
                        min={0.1}
                        max={20}
                        step={0.1}
                        value={settings.staffMultiplier}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            staffMultiplier: Number(e.target.value) || 1,
                          })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{t("hrSalesBonus_tiers")}</CardTitle>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateTier([
                        ...settings.tiers,
                        {
                          threshold:
                            (settings.tiers[settings.tiers.length - 1]?.threshold || 400000) + 100000,
                          amount: 1000,
                        },
                      ])
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    {t("hrSalesBonus_add_tier")}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-xs text-muted-foreground mb-2">{t("hrSalesBonus_tiers_hint")}</p>
                  {settings.tiers.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      {t("hrSalesBonus_no_tiers")}
                    </p>
                  ) : (
                    settings.tiers.map((tier, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end rounded-md border p-2"
                      >
                        <div className="space-y-1">
                          <Label className="text-xs">{t("hrSalesBonus_threshold")}</Label>
                          <Input
                            type="number"
                            min={0}
                            value={tier.threshold}
                            onChange={(e) => {
                              const next = [...settings.tiers]
                              next[idx] = { ...tier, threshold: Number(e.target.value) || 0 }
                              updateTier(next)
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">{t("hrSalesBonus_amount")}</Label>
                          <Input
                            type="number"
                            min={0}
                            value={tier.amount}
                            onChange={(e) => {
                              const next = [...settings.tiers]
                              next[idx] = { ...tier, amount: Number(e.target.value) || 0 }
                              updateTier(next)
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 text-destructive"
                          onClick={() => updateTier(settings.tiers.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button type="button" onClick={() => void onSave()} disabled={saving || !store}>
                  {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                  {t("save")}
                </Button>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="preview" className="space-y-4 pt-2">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>{t("hrSalesBonus_month")}</Label>
              <Input
                type="month"
                className="w-[180px]"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
            <Button type="button" onClick={() => void onPreview()} disabled={loadingPreview || !store}>
              {loadingPreview ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {t("hrSalesBonus_run_preview")}
            </Button>
          </div>

          {preview ? (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {labelOf(preview.storeCode)} · {preview.period.start} ~ {preview.period.end}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t("hrSalesBonus_sales_total")}: ฿{fmtBaht(preview.salesTotal)}
                  {" · "}
                  {preview.settings.enabled ? t("hrSalesBonus_on") : t("hrSalesBonus_off")}
                </p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">{t("hrSalesBonus_col_name")}</th>
                      <th className="py-2 pr-2 font-medium">{t("hrSalesBonus_col_role")}</th>
                      <th className="py-2 pr-2 font-medium text-right">{t("hrSalesBonus_col_base")}</th>
                      <th className="py-2 pr-2 font-medium text-right">{t("hrSalesBonus_col_mult")}</th>
                      <th className="py-2 pr-2 font-medium text-right">{t("hrSalesBonus_col_absent")}</th>
                      <th className="py-2 pr-2 font-medium text-right">{t("hrSalesBonus_col_final")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.employees.map((e) => (
                      <tr key={`${e.employeeId}-${e.name}`} className="border-b last:border-0">
                        <td className="py-2 pr-2">{e.name}</td>
                        <td className="py-2 pr-2">{e.role || "-"}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">
                          {fmtBaht(e.result.baseAmount)}
                        </td>
                        <td className="py-2 pr-2 text-right tabular-nums">×{e.result.multiplier}</td>
                        <td className="py-2 pr-2 text-right tabular-nums">{e.absenceDays}</td>
                        <td className="py-2 pr-2 text-right tabular-nums font-medium">
                          {fmtBaht(e.result.finalAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.employees.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("hrSalesBonus_no_employees")}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : (
            <p className="text-sm text-muted-foreground py-6">{t("hrSalesBonus_preview_hint")}</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
