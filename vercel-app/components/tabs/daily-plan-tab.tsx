"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown, ChevronUp, Copy, Lock, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { appAlert, appConfirm } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { closeDailyPlan, getMyDailyPlan, type DailyPlanBundle, type DailyPlanItem } from "@/lib/api-client"
import { buildDailyPlanLineText, dailyPlanLabelers, dailyPlanLinkHref, minutesLabel } from "@/lib/daily-plan-i18n"
import { DailyPlanItems, type DailyPlanLinkKind } from "@/components/daily-plan/daily-plan-items"

function PlanHeader({ bundle, t }: { bundle: DailyPlanBundle; t: (k: string) => string }) {
  const label = dailyPlanLabelers(t)
  const { plan, summary } = bundle
  const route = (plan.route_stores || []).join(" → ")
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">{plan.plan_date}</span>
        <span>· {label.role(plan.role_scope)}</span>
        {plan.role_scope === "staff" ? <span>· {label.position(plan.position)}</span> : null}
        {plan.shift_in ? (
          <span>
            · {plan.shift_in}–{plan.shift_out}
          </span>
        ) : null}
        <span className="ml-auto">{label.planStatus(plan.status)}</span>
      </div>
      <p className="text-sm font-medium">{route || plan.store_name}</p>
      <div className="h-2 overflow-hidden rounded bg-muted">
        <div className="h-full bg-emerald-500 transition-all" style={{ width: `${summary.doneRate}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {t("dp_col_progress")} {summary.done}/{summary.total} ({summary.doneRate}%) · {t("dp_est")}{" "}
        {minutesLabel(summary.estTotal, t)} · {t("dp_actual")} {minutesLabel(summary.actualTotal, t)}
      </p>
      {plan.briefing_note ? (
        <p className="rounded bg-amber-50 p-2 text-xs whitespace-pre-wrap dark:bg-amber-950/30">💬 {plan.briefing_note}</p>
      ) : null}
    </div>
  )
}

export function DailyPlanTab({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const [today, setToday] = useState<DailyPlanBundle | null>(null)
  const [tomorrow, setTomorrow] = useState<DailyPlanBundle | null>(null)
  const [loading, setLoading] = useState(false)
  const [notReady, setNotReady] = useState(false)
  const [showTomorrow, setShowTomorrow] = useState(false)
  const [closing, setClosing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getMyDailyPlan()
      setToday(res.today || null)
      setTomorrow(res.tomorrow || null)
      setNotReady(!!res.notReady)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const onLink = (it: DailyPlanItem, kind: DailyPlanLinkKind) => {
    if (kind === "open" && it.link_type === "store_visit" && onNavigate) {
      onNavigate("visit")
      return
    }
    const href = dailyPlanLinkHref(it, kind)
    if (href) router.push(href)
  }

  const copyLine = async () => {
    if (!today) return
    const text = buildDailyPlanLineText(today, t)
    try {
      await navigator.clipboard.writeText(text)
      await appAlert(t("dp_line_copied"))
    } catch {
      await appAlert(text)
    }
  }

  const onClose = async () => {
    if (!today) return
    const open = today.summary.open
    const msg = open > 0 ? t("dp_close_confirm_open").replace("{n}", String(open)) : t("dp_close_confirm")
    if (!(await appConfirm(msg))) return
    setClosing(true)
    try {
      const res = await closeDailyPlan(today.plan.id)
      if (!res.success || !res.result) {
        await appAlert(res.messageKey ? t(res.messageKey) : translateApiMessage(res.message, t) || t("dp_save_fail"))
        return
      }
      const r = res.result
      await appAlert(
        t("dp_close_done")
          .replace("{done}", String(r.done))
          .replace("{total}", String(r.total))
          .replace("{carried}", String(r.carried))
      )
      await load()
    } finally {
      setClosing(false)
    }
  }

  return (
    <div className="space-y-3 px-3 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("tabDailyPlan")}</h2>
        <div className="flex items-center gap-1">
          {today ? (
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void copyLine()}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              {t("dp_line_copy")}
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {notReady ? <p className="text-xs text-amber-600">{t("dp_not_ready")}</p> : null}

      {!today ? (
        <Card>
          <CardContent className="space-y-1 p-4 text-center">
            <p className="text-sm">{loading ? t("loading") : t("dp_no_plan_today")}</p>
            {!loading ? <p className="text-xs text-muted-foreground">{t("dp_no_plan_today_hint")}</p> : null}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-3">
              <PlanHeader bundle={today} t={t} />
            </CardContent>
          </Card>

          <DailyPlanItems
            plan={today.plan}
            items={today.items}
            t={t}
            travelMinutes={today.travelMinutes}
            onChanged={() => void load()}
            onLink={onLink}
          />

          {today.plan.status === "closed" ? (
            <p className="flex items-center justify-center gap-1 rounded bg-muted p-2 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              {t("dp_closed_note")}
            </p>
          ) : (
            <Button className="w-full" variant="secondary" disabled={closing} onClick={() => void onClose()}>
              <Lock className="mr-1 h-4 w-4" />
              {t("dp_btn_close")}
            </Button>
          )}
        </>
      )}

      {tomorrow ? (
        <Card>
          <CardContent className="space-y-2 p-3">
            <button
              type="button"
              className="flex w-full items-center justify-between text-sm font-semibold"
              onClick={() => setShowTomorrow((v) => !v)}
            >
              <span>
                📅 {t("dp_tomorrow_preview")} · {tomorrow.summary.total} · {minutesLabel(tomorrow.summary.estTotal, t)}
              </span>
              {showTomorrow ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showTomorrow ? (
              <>
                <PlanHeader bundle={tomorrow} t={t} />
                <DailyPlanItems
                  plan={tomorrow.plan}
                  items={tomorrow.items}
                  t={t}
                  travelMinutes={tomorrow.travelMinutes}
                  readOnly
                  onChanged={() => void load()}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
