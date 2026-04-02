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
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { translateApiMessage } from "@/lib/translate-api-message"
import { appAlert } from "@/lib/app-message"
import { getPayrollHazGradeRules, savePayrollHazGradeRules } from "@/lib/api-client"

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
