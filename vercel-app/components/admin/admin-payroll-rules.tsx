"use client"

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { appAlert } from "@/lib/app-message"
import { i18nVar } from "@/lib/payroll-explain-i18n"
import {
  getPayrollCycle,
  getPayrollHazGradeRules,
  savePayrollCycle,
  savePayrollHazGradeRules,
} from "@/lib/api-client"

const POLICY_IDS = [1, 2, 3] as const

function PayrollPolicySections({ t }: { t: (k: string) => string }) {
  return (
    <div className="space-y-3">
      <h2 className="text-base font-semibold">{t("pay_rules_policy_heading")}</h2>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{t("pay_rules_policy_disclaimer")}</p>
      <div className="space-y-3">
        {POLICY_IDS.map((id) => (
          <div
            key={id}
            className="rounded-lg border border-border/80 bg-card px-3 py-3 shadow-sm"
          >
            <h3 className="text-sm font-semibold text-foreground">{t(`pay_rules_pol_${id}_title`)}</h3>
            <ul className="mt-2 space-y-1.5 text-xs text-card-foreground leading-relaxed list-none pl-0">
              <li>
                <span className="font-medium text-muted-foreground">{t("pay_rules_pol_label_target")}</span>{" "}
                {t(`pay_rules_pol_${id}_target`)}
              </li>
              <li>
                <span className="font-medium text-muted-foreground">{t("pay_rules_pol_label_amount")}</span>{" "}
                {t(`pay_rules_pol_${id}_amount`)}
              </li>
            </ul>
            {id <= 2 ? (
              <p className="mt-2 text-[11px] text-muted-foreground border-l-2 border-primary/30 pl-2.5 leading-snug">
                {t(`pay_rules_pol_${id}_note`)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function dayOptions(max: number, eomLabel: string, dayLabel: (n: number) => string) {
  return [
    { value: "0", label: eomLabel },
    ...Array.from({ length: max }, (_, i) => {
      const n = i + 1
      return { value: String(n), label: dayLabel(n) }
    }),
  ]
}

function PayrollCycleSection({ t }: { t: (k: string) => string }) {
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [canEdit, setCanEdit] = React.useState(false)
  const [effectiveMonth, setEffectiveMonth] = React.useState("")
  const [periodEndDay, setPeriodEndDay] = React.useState("0")
  const [payDay, setPayDay] = React.useState("5")
  const [payMonthOffset, setPayMonthOffset] = React.useState("1")
  const [preview, setPreview] = React.useState<
    Array<{ month?: string; start?: string; end?: string; payYmd?: string; isTransitionShort?: boolean }>
  >([])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await getPayrollCycle()
      setCanEdit(!!d.canEdit)
      const versions = d.settings?.versions || []
      const latest = versions[versions.length - 1]
      setEffectiveMonth(latest?.effectiveMonth || d.defaultMonth || "")
      setPeriodEndDay(String(latest?.periodEndDay ?? 0))
      setPayDay(String(latest?.payDay ?? 5))
      setPayMonthOffset(String(latest?.payMonthOffset ?? 1))
      setPreview(d.preview || [])
    } catch {
      setCanEdit(false)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const applyPreset = (kind: "calendar" | "26_25") => {
    if (kind === "calendar") {
      setPeriodEndDay("0")
      setPayDay("5")
      setPayMonthOffset("1")
    } else {
      setPeriodEndDay("25")
      setPayDay("0")
      setPayMonthOffset("0")
    }
  }

  const handleSave = async () => {
    if (!canEdit) return
    if (!/^\d{4}-\d{2}$/.test(effectiveMonth)) {
      await appAlert(t("pay_month_select"))
      return
    }
    setSaving(true)
    try {
      const res = await savePayrollCycle({
        effectiveMonth,
        periodEndDay: Number(periodEndDay),
        payDay: Number(payDay),
        payMonthOffset: Number(payMonthOffset),
      })
      if (res.success) {
        setPreview(res.preview || [])
        await appAlert(
          res.warning
            ? `${t("pay_rules_saved")}\n${res.warning}`
            : t("pay_rules_saved")
        )
        await load()
      } else {
        await appAlert(translateApiMessage(res.message, t) || t("pay_save_fail"))
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : t("pay_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  const dayLbl = (n: number) => i18nVar(t("pay_cycle_day_n"), { n })
  const periodEndOpts = dayOptions(27, t("pay_cycle_period_end_eom"), dayLbl)
  const payDayOpts = dayOptions(28, t("pay_cycle_pay_day_eom"), dayLbl)

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t("pay_cycle_heading")}</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("pay_cycle_intro")}</p>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("loading")}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={!canEdit}
                onClick={() => applyPreset("calendar")}
              >
                {t("pay_cycle_preset_calendar")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={!canEdit}
                onClick={() => applyPreset("26_25")}
              >
                {t("pay_cycle_preset_26_25")}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold block">{t("pay_cycle_effective")}</label>
                <Input
                  type="month"
                  value={effectiveMonth}
                  onChange={(e) => setEffectiveMonth(e.target.value.slice(0, 7))}
                  disabled={!canEdit}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold block">{t("pay_cycle_period_end")}</label>
                <Select value={periodEndDay} onValueChange={setPeriodEndDay} disabled={!canEdit}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periodEndOpts.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold block">{t("pay_cycle_pay_day")}</label>
                <Select value={payDay} onValueChange={setPayDay} disabled={!canEdit}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {payDayOpts.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold block">{t("pay_cycle_pay_offset")}</label>
                <Select value={payMonthOffset} onValueChange={setPayMonthOffset} disabled={!canEdit}>
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("pay_cycle_pay_offset_0")}</SelectItem>
                    <SelectItem value="1">{t("pay_cycle_pay_offset_1")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{t("pay_cycle_two_pay_note")}</p>
            {preview.length > 0 ? (
              <div className="rounded-lg border border-border/80 bg-muted/20 px-3 py-2 text-xs space-y-1">
                <p className="font-medium">{t("pay_cycle_preview")}</p>
                {preview.map((p) => (
                  <p key={String(p.month)} className="text-muted-foreground">
                    {p.month}:{" "}
                    {i18nVar(t("pay_cycle_hint"), {
                      start: p.start || "",
                      end: p.end || "",
                      pay: p.payYmd || "",
                    })}
                    {p.isTransitionShort
                      ? ` · ${i18nVar(t("pay_cycle_short_note"), {
                          start: p.start || "",
                          end: p.end || "",
                        })}`
                      : ""}
                  </p>
                ))}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <Button size="sm" className="h-8 text-xs" disabled={!canEdit || saving} onClick={() => void handleSave()}>
                {saving ? t("loading") : t("pay_cycle_save")}
              </Button>
              {!canEdit ? <p className="text-[11px] text-muted-foreground">{t("pay_rules_readonly")}</p> : null}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export function AdminPayrollRules() {
  const { lang } = useLang()
  const t = useT(lang)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [requireEvalGrade, setRequireEvalGrade] = React.useState(true)
  const [minEvalGrade, setMinEvalGrade] = React.useState("B")
  const [gradeOptions, setGradeOptions] = React.useState<string[]>(["S", "A", "B", "C", "F"])
  const [canEdit, setCanEdit] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const d = await getPayrollHazGradeRules()
      setRequireEvalGrade(d.requireEvalGrade !== false)
      setMinEvalGrade(d.minEvalGrade || "B")
      if (Array.isArray(d.gradeOptions) && d.gradeOptions.length > 0) {
        setGradeOptions(d.gradeOptions)
      }
      setCanEdit(!!d.canEdit)
    } catch {
      setRequireEvalGrade(true)
      setMinEvalGrade("B")
      setCanEdit(false)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleSave = async () => {
    if (!canEdit) return
    setSaving(true)
    try {
      const res = await savePayrollHazGradeRules({ requireEvalGrade, minEvalGrade })
      if (res.success) {
        await appAlert(t("pay_rules_saved"))
        await load()
      } else {
        await appAlert(translateApiMessage((res as { message?: string }).message, t) || t("pay_save_fail"))
      }
    } catch (e) {
      await appAlert(e instanceof Error ? e.message : t("pay_save_fail"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6 pb-6">
          <PayrollPolicySections t={t} />
        </CardContent>
      </Card>

      <PayrollCycleSection t={t} />

      <Card>
        <CardContent className="pt-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold">{t("pay_rules_settings_heading")}</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{t("pay_rules_intro")}</p>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t("loading")}</p>
        ) : (
          <>
            <div className="flex items-start gap-2 rounded-lg border border-border/80 bg-muted/20 p-3">
              <Checkbox
                id="pay-rules-require-grade"
                checked={requireEvalGrade}
                disabled={!canEdit}
                onCheckedChange={(c) => setRequireEvalGrade(c === true)}
                className="mt-0.5"
              />
              <label htmlFor="pay-rules-require-grade" className="text-xs leading-snug cursor-pointer">
                <span className="font-medium block">{t("pay_rules_require_grade")}</span>
                <span className="text-muted-foreground">{t("pay_rules_require_grade_hint")}</span>
              </label>
            </div>

            <div className="space-y-1.5 max-w-xs">
              <label className="text-xs font-semibold block">{t("pay_rules_min_grade")}</label>
              <Select
                value={minEvalGrade}
                onValueChange={setMinEvalGrade}
                disabled={!canEdit || !requireEvalGrade}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {gradeOptions.map((g) => (
                    <SelectItem key={g} value={g}>
                      {g}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">{t("pay_rules_min_grade_hint")}</p>
            </div>

            {!canEdit && (
              <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/50 rounded-md px-3 py-2">
                {t("pay_rules_readonly")}
              </p>
            )}

            <Button type="button" className="h-9 text-xs" disabled={!canEdit || saving} onClick={() => void handleSave()}>
              {saving ? t("loading") : t("pay_rules_save")}
            </Button>
          </>
        )}
        </CardContent>
      </Card>
    </div>
  )
}
