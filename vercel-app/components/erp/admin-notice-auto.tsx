"use client"

import * as React from "react"
import { BellRing, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import {
  getAutoNoticeSettings,
  getNoticeOptions,
  updateAutoNoticeSettings,
  type AutoNoticeCustomRuleClient,
  type AutoNoticeStockTakeClient,
  type AutoNoticeWorkLogClient,
} from "@/lib/api-client"
import {
  AUTO_NOTICE_CUSTOM_RULES_MAX,
  newAutoNoticeCustomRuleId,
} from "@/lib/auto-notice-settings"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i)
const DAYS_BEFORE_OPTIONS = Array.from({ length: 7 }, (_, i) => i + 1)
const DAY_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => i + 1)
const WEEKDAY_KEYS = [
  { value: 1, key: "noticeAutoWeekdayMon" },
  { value: 2, key: "noticeAutoWeekdayTue" },
  { value: 3, key: "noticeAutoWeekdayWed" },
  { value: 4, key: "noticeAutoWeekdayThu" },
  { value: 5, key: "noticeAutoWeekdayFri" },
  { value: 6, key: "noticeAutoWeekdaySat" },
  { value: 7, key: "noticeAutoWeekdaySun" },
] as const

function emptyCustomRule(): AutoNoticeCustomRuleClient {
  return {
    id: newAutoNoticeCustomRuleId(),
    enabled: true,
    title: "",
    body: "",
    hourBangkok: 10,
    schedule: { kind: "daily" },
    audience: { kind: "managers" },
  }
}

export function AdminNoticeAuto() {
  const { lang } = useLang()
  const t = useT(lang)

  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [workLog, setWorkLog] = React.useState<AutoNoticeWorkLogClient>({
    enabled: true,
    hourBangkok: 10,
    notifyManager: true,
  })
  const [stockTake, setStockTake] = React.useState<AutoNoticeStockTakeClient>({
    enabled: false,
    daysBeforeMonthEnd: 2,
    hourBangkok: 10,
    title: "",
    body: "",
    target: "managers",
  })
  const [customRules, setCustomRules] = React.useState<AutoNoticeCustomRuleClient[]>([])
  const [lastRun, setLastRun] = React.useState<{
    work_log: string
    stock_take: string
    custom?: Record<string, string>
  }>({ work_log: "", stock_take: "", custom: {} })
  const [stores, setStores] = React.useState<string[]>([])
  const [roles, setRoles] = React.useState<string[]>([])

  const load = React.useCallback(async () => {
    setLoading(true)
    setMessage("")
    try {
      const [d, opts] = await Promise.all([getAutoNoticeSettings(), getNoticeOptions().catch(() => null)])
      setWorkLog(d.workLog)
      setStockTake(d.stockTake)
      setCustomRules(Array.isArray(d.customRules) ? d.customRules : [])
      setLastRun(d.lastRun || { work_log: "", stock_take: "", custom: {} })
      if (opts) {
        setStores(opts.stores || [])
        setRoles(opts.roles || [])
      }
    } catch (e) {
      setMessage((e as Error).message || t("noticeAutoLoadFail"))
    } finally {
      setLoading(false)
    }
  }, [t])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleSave = async () => {
    for (const r of customRules) {
      if (!r.title.trim() || !r.body.trim()) {
        setMessage(t("noticeAutoCustomNeedTitleBody"))
        return
      }
    }
    setSaving(true)
    setMessage("")
    try {
      const res = await updateAutoNoticeSettings({ workLog, stockTake, customRules })
      if (!res.success) {
        setMessage(res.message || t("noticeAutoSaveFail"))
        return
      }
      if (res.workLog) setWorkLog(res.workLog)
      if (res.stockTake) setStockTake(res.stockTake)
      if (res.customRules) setCustomRules(res.customRules)
      if (res.lastRun) setLastRun(res.lastRun)
      setMessage(t("noticeAutoSaveOk"))
    } catch (e) {
      setMessage((e as Error).message || t("noticeAutoSaveFail"))
    } finally {
      setSaving(false)
    }
  }

  const updateCustom = (id: string, patch: Partial<AutoNoticeCustomRuleClient>) => {
    setCustomRules((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  if (loading) {
    return <p className="py-8 text-center text-muted-foreground text-xs">{t("loading")}</p>
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <p className="text-xs text-muted-foreground">{t("noticeAutoDesc")}</p>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <BellRing className="h-4 w-4 text-primary" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{t("noticeAutoWorkLogTitle")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("noticeAutoWorkLogDesc")}</p>
                </div>
                <Checkbox
                  checked={workLog.enabled}
                  onCheckedChange={(v) => setWorkLog((s) => ({ ...s, enabled: v === true }))}
                  aria-label={t("noticeAutoEnabled")}
                />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold block mb-1">{t("noticeAutoHourBangkok")}</label>
                  <Select
                    value={String(workLog.hourBangkok)}
                    onValueChange={(v) => setWorkLog((s) => ({ ...s, hourBangkok: Number(v) }))}
                    disabled={!workLog.enabled}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOUR_OPTIONS.map((h) => (
                        <SelectItem key={h} value={String(h)}>
                          {String(h).padStart(2, "0")}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <Checkbox
                      checked={workLog.notifyManager}
                      onCheckedChange={(v) =>
                        setWorkLog((s) => ({ ...s, notifyManager: v === true }))
                      }
                      disabled={!workLog.enabled}
                    />
                    <span>{t("noticeAutoNotifyManager")}</span>
                  </label>
                </div>
              </div>
              {lastRun.work_log ? (
                <p className="text-[10px] text-muted-foreground mt-2">
                  {t("noticeAutoLastRunWorkLog").replace("{date}", lastRun.work_log)}
                </p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{t("noticeAutoStockTakeTitle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("noticeAutoStockTakeDesc")}</p>
            </div>
            <Checkbox
              checked={stockTake.enabled}
              onCheckedChange={(v) => setStockTake((s) => ({ ...s, enabled: v === true }))}
              aria-label={t("noticeAutoEnabled")}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold block mb-1">{t("noticeAutoDaysBeforeMonthEnd")}</label>
              <Select
                value={String(stockTake.daysBeforeMonthEnd)}
                onValueChange={(v) =>
                  setStockTake((s) => ({ ...s, daysBeforeMonthEnd: Number(v) }))
                }
                disabled={!stockTake.enabled}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS_BEFORE_OPTIONS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {t("noticeAutoDaysBeforeValue").replace("{n}", String(d))}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-semibold block mb-1">{t("noticeAutoHourBangkok")}</label>
              <Select
                value={String(stockTake.hourBangkok)}
                onValueChange={(v) => setStockTake((s) => ({ ...s, hourBangkok: Number(v) }))}
                disabled={!stockTake.enabled}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HOUR_OPTIONS.map((h) => (
                    <SelectItem key={h} value={String(h)}>
                      {String(h).padStart(2, "0")}:00
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">{t("noticeAutoTitle")}</label>
            <Input
              className="h-9 text-xs"
              value={stockTake.title}
              onChange={(e) => setStockTake((s) => ({ ...s, title: e.target.value }))}
              disabled={!stockTake.enabled}
            />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">{t("noticeAutoBody")}</label>
            <Textarea
              className="min-h-[88px] text-xs"
              value={stockTake.body}
              onChange={(e) => setStockTake((s) => ({ ...s, body: e.target.value }))}
              disabled={!stockTake.enabled}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">{t("noticeAutoStockTakeTargetHint")}</p>
          {lastRun.stock_take ? (
            <p className="text-[10px] text-muted-foreground">
              {t("noticeAutoLastRunStockTake").replace("{month}", lastRun.stock_take)}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{t("noticeAutoCustomSectionTitle")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("noticeAutoCustomSectionDesc")}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-1.5"
            disabled={customRules.length >= AUTO_NOTICE_CUSTOM_RULES_MAX || saving}
            onClick={() => setCustomRules((list) => [...list, emptyCustomRule()])}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t("noticeAutoCustomAdd")}
          </Button>
        </div>

        {customRules.length === 0 ? (
          <p className="text-xs text-muted-foreground rounded-lg border border-dashed p-4">
            {t("noticeAutoCustomEmpty")}
          </p>
        ) : null}

        {customRules.map((rule) => {
          const schKind = rule.schedule.kind
          const audKind = rule.audience.kind
          const last = lastRun.custom?.[rule.id]
          return (
            <Card key={rule.id}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-xs">
                    <Checkbox
                      checked={rule.enabled}
                      onCheckedChange={(v) => updateCustom(rule.id, { enabled: v === true })}
                    />
                    <span className="font-medium text-sm">{t("noticeAutoEnabled")}</span>
                  </label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-destructive"
                    onClick={() => setCustomRules((list) => list.filter((r) => r.id !== rule.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    <span className="sr-only">{t("noticeAutoCustomDelete")}</span>
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("noticeAutoCustomSchedule")}</label>
                    <Select
                      value={schKind}
                      onValueChange={(v) => {
                        if (v === "daily") updateCustom(rule.id, { schedule: { kind: "daily" } })
                        else if (v === "weekly")
                          updateCustom(rule.id, { schedule: { kind: "weekly", weekday: 1 } })
                        else if (v === "monthly")
                          updateCustom(rule.id, { schedule: { kind: "monthly", dayOfMonth: 1 } })
                        else
                          updateCustom(rule.id, {
                            schedule: { kind: "before_month_end", daysBefore: 1 },
                          })
                      }}
                      disabled={!rule.enabled}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">{t("noticeAutoScheduleDaily")}</SelectItem>
                        <SelectItem value="weekly">{t("noticeAutoScheduleWeekly")}</SelectItem>
                        <SelectItem value="monthly">{t("noticeAutoScheduleMonthly")}</SelectItem>
                        <SelectItem value="before_month_end">
                          {t("noticeAutoScheduleBeforeMonthEnd")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("noticeAutoHourBangkok")}</label>
                    <Select
                      value={String(rule.hourBangkok)}
                      onValueChange={(v) => updateCustom(rule.id, { hourBangkok: Number(v) })}
                      disabled={!rule.enabled}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {HOUR_OPTIONS.map((h) => (
                          <SelectItem key={h} value={String(h)}>
                            {String(h).padStart(2, "0")}:00
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {schKind === "weekly" && rule.schedule.kind === "weekly" ? (
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("noticeAutoWeekday")}</label>
                    <Select
                      value={String(rule.schedule.weekday)}
                      onValueChange={(v) =>
                        updateCustom(rule.id, {
                          schedule: { kind: "weekly", weekday: Number(v) },
                        })
                      }
                      disabled={!rule.enabled}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAY_KEYS.map((w) => (
                          <SelectItem key={w.value} value={String(w.value)}>
                            {t(w.key)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {schKind === "monthly" && rule.schedule.kind === "monthly" ? (
                  <div>
                    <label className="text-xs font-semibold block mb-1">{t("noticeAutoDayOfMonth")}</label>
                    <Select
                      value={String(rule.schedule.dayOfMonth)}
                      onValueChange={(v) =>
                        updateCustom(rule.id, {
                          schedule: { kind: "monthly", dayOfMonth: Number(v) },
                        })
                      }
                      disabled={!rule.enabled}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_OF_MONTH_OPTIONS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                {schKind === "before_month_end" && rule.schedule.kind === "before_month_end" ? (
                  <div>
                    <label className="text-xs font-semibold block mb-1">
                      {t("noticeAutoDaysBeforeMonthEnd")}
                    </label>
                    <Select
                      value={String(rule.schedule.daysBefore)}
                      onValueChange={(v) =>
                        updateCustom(rule.id, {
                          schedule: { kind: "before_month_end", daysBefore: Number(v) },
                        })
                      }
                      disabled={!rule.enabled}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_BEFORE_OPTIONS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {t("noticeAutoDaysBeforeValue").replace("{n}", String(d))}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div>
                  <label className="text-xs font-semibold block mb-1">{t("noticeAutoCustomAudience")}</label>
                  <Select
                    value={audKind}
                    onValueChange={(v) => {
                      if (v === "managers") updateCustom(rule.id, { audience: { kind: "managers" } })
                      else if (v === "all") updateCustom(rule.id, { audience: { kind: "all" } })
                      else
                        updateCustom(rule.id, {
                          audience: { kind: "store_role", store: "전체", role: "전체" },
                        })
                    }}
                    disabled={!rule.enabled}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="managers">{t("noticeAutoAudienceManagers")}</SelectItem>
                      <SelectItem value="all">{t("noticeAutoAudienceAll")}</SelectItem>
                      <SelectItem value="store_role">{t("noticeAutoAudienceStoreRole")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {audKind === "store_role" && rule.audience.kind === "store_role" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold block mb-1">{t("store")}</label>
                      <Select
                        value={rule.audience.store || "전체"}
                        onValueChange={(v) =>
                          updateCustom(rule.id, {
                            audience: { kind: "store_role", store: v, role: rule.audience.kind === "store_role" ? rule.audience.role : "전체" },
                          })
                        }
                        disabled={!rule.enabled}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="전체">{t("noticeAutoAudienceAllStores")}</SelectItem>
                          {stores.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold block mb-1">{t("noticeAutoRole")}</label>
                      <Select
                        value={rule.audience.role || "전체"}
                        onValueChange={(v) =>
                          updateCustom(rule.id, {
                            audience: {
                              kind: "store_role",
                              store: rule.audience.kind === "store_role" ? rule.audience.store : "전체",
                              role: v,
                            },
                          })
                        }
                        disabled={!rule.enabled}
                      >
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="전체">{t("noticeAutoAudienceAllRoles")}</SelectItem>
                          {roles.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : null}

                <div>
                  <label className="text-xs font-semibold block mb-1">{t("noticeAutoTitle")}</label>
                  <Input
                    className="h-9 text-xs"
                    value={rule.title}
                    onChange={(e) => updateCustom(rule.id, { title: e.target.value })}
                    disabled={!rule.enabled}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1">{t("noticeAutoBody")}</label>
                  <Textarea
                    className="min-h-[72px] text-xs"
                    value={rule.body}
                    onChange={(e) => updateCustom(rule.id, { body: e.target.value })}
                    disabled={!rule.enabled}
                  />
                </div>
                {last ? (
                  <p className="text-[10px] text-muted-foreground">
                    {t("noticeAutoCustomLastRun").replace("{key}", last)}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button className="h-9" onClick={() => void handleSave()} disabled={saving}>
          {saving ? t("loading") : t("settings_save_btn")}
        </Button>
        <Button type="button" variant="outline" className="h-9" onClick={() => void load()} disabled={saving}>
          {t("noticeAutoReload")}
        </Button>
        {message ? <p className="text-xs text-muted-foreground">{message}</p> : null}
      </div>

      <p className="text-[10px] text-muted-foreground">{t("noticeAutoCronHint")}</p>
    </div>
  )
}
