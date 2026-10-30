"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ChevronDown, ChevronUp, Copy, Lock, Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { appAlert, appConfirm } from "@/lib/app-message"
import { translateApiMessage } from "@/lib/translate-api-message"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import {
  closeDailyPlan,
  getDailyPlanTeam,
  getMyDailyPlan,
  saveDailyPlanAssignment,
  type DailyPlanBundle,
  type DailyPlanItem,
  type DailyPlanTeamMember,
} from "@/lib/api-client"
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
      {plan.status !== "closed" ? (
        <p className="text-[11px] text-muted-foreground">{t("dp_clockin_shifts_hint")}</p>
      ) : null}
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

type ViewMode = "mine" | "team" | "member"

export function DailyPlanTab({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const { lang } = useLang()
  const t = useT(lang)
  const label = dailyPlanLabelers(t)
  const router = useRouter()
  const [today, setToday] = useState<DailyPlanBundle | null>(null)
  const [tomorrow, setTomorrow] = useState<DailyPlanBundle | null>(null)
  const [loading, setLoading] = useState(false)
  const [notReady, setNotReady] = useState(false)
  const [showTomorrow, setShowTomorrow] = useState(false)
  const [closing, setClosing] = useState(false)
  const [canManageTeam, setCanManageTeam] = useState(false)
  const [teamMembers, setTeamMembers] = useState<DailyPlanTeamMember[]>([])
  const [view, setView] = useState<ViewMode>("mine")
  const [memberBundle, setMemberBundle] = useState<DailyPlanBundle | null>(null)
  const [memberName, setMemberName] = useState("")
  const [creatingId, setCreatingId] = useState<number | null>(null)

  const loadMine = useCallback(async () => {
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

  const loadTeam = useCallback(async () => {
    const date = getBangkokTodayDateString()
    const res = await getDailyPlanTeam(date)
    setCanManageTeam(!!res.canManageTeam)
    setTeamMembers(Array.isArray(res.members) ? res.members : [])
    if (res.notReady) setNotReady(true)
  }, [])

  const load = useCallback(async () => {
    await Promise.all([loadMine(), loadTeam()])
  }, [loadMine, loadTeam])

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

  const openMember = async (m: DailyPlanTeamMember) => {
    if (!m.planId) return
    setLoading(true)
    try {
      const res = await getMyDailyPlan({ planId: m.planId })
      if (!res.today) {
        await appAlert(t("dp_no_plan_today"))
        return
      }
      setMemberBundle(res.today)
      setMemberName(m.nick || m.name)
      setView("member")
    } finally {
      setLoading(false)
    }
  }

  const createMemberPlan = async (m: DailyPlanTeamMember) => {
    setCreatingId(m.employeeId)
    try {
      const res = await saveDailyPlanAssignment({
        date: getBangkokTodayDateString(),
        employeeId: m.employeeId,
        publish: true,
      })
      if (!res.success) {
        await appAlert(res.messageKey ? t(res.messageKey) : translateApiMessage(res.message, t) || t("dp_save_fail"))
        return
      }
      await loadTeam()
      if (res.planId) {
        await openMember({ ...m, planId: res.planId })
      }
    } finally {
      setCreatingId(null)
    }
  }

  const refreshMember = async () => {
    if (!memberBundle?.plan.id) return
    const res = await getMyDailyPlan({ planId: memberBundle.plan.id })
    if (res.today) setMemberBundle(res.today)
    await loadTeam()
  }

  /** 팀 관리 권한(매니저/SV/본사)이면 내 일정 항목을 직원에게 위임 가능 */
  const canDelegateMine = canManageTeam && !!today

  return (
    <div className="space-y-3 px-3 py-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("tabDailyPlan")}</h2>
        <div className="flex items-center gap-1">
          {view === "mine" && today ? (
            <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => void copyLine()}>
              <Copy className="mr-1 h-3.5 w-3.5" />
              {t("dp_line_copy")}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void (view === "member" ? refreshMember() : load())}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {canManageTeam && view !== "member" ? (
        <div className="flex gap-1 rounded-md border p-0.5">
          <Button
            size="sm"
            variant={view === "mine" ? "default" : "ghost"}
            className="h-8 flex-1 text-xs"
            onClick={() => setView("mine")}
          >
            {t("dp_tab_mine")}
          </Button>
          <Button
            size="sm"
            variant={view === "team" ? "default" : "ghost"}
            className="h-8 flex-1 text-xs"
            onClick={() => setView("team")}
          >
            {t("dp_tab_team")}
          </Button>
        </div>
      ) : null}

      {notReady ? <p className="text-xs text-amber-600">{t("dp_not_ready")}</p> : null}

      {view === "member" && memberBundle ? (
        <>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => {
                setView("team")
                setMemberBundle(null)
              }}
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              {t("dp_team_back")}
            </Button>
            <p className="truncate text-sm font-medium">{t("dp_team_viewing").replace("{name}", memberName)}</p>
          </div>
          <Card>
            <CardContent className="p-3">
              <PlanHeader bundle={memberBundle} t={t} />
            </CardContent>
          </Card>
          <DailyPlanItems
            plan={memberBundle.plan}
            items={memberBundle.items}
            t={t}
            travelMinutes={memberBundle.travelMinutes}
            onChanged={() => void refreshMember()}
            onLink={onLink}
          />
        </>
      ) : null}

      {view === "team" ? (
        <div className="space-y-2">
          {teamMembers.length === 0 ? (
            <Card>
              <CardContent className="p-4 text-center text-sm text-muted-foreground">
                {loading ? t("loading") : t("dp_team_empty")}
              </CardContent>
            </Card>
          ) : (
            teamMembers.map((m) => (
              <Card key={m.employeeId}>
                <CardContent className="flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.nick || m.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {m.store} · {label.role(m.planRole)}
                      {m.late > 0 ? (
                        <span className="ml-1 font-semibold text-red-600">
                          · {t("dp_late_n").replace("{n}", String(m.late))}
                        </span>
                      ) : null}
                    </p>
                    {m.planId ? (
                      <div className="mt-1">
                        <div className="h-1.5 overflow-hidden rounded bg-muted">
                          <div className="h-full bg-emerald-500" style={{ width: `${m.doneRate}%` }} />
                        </div>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          {m.done}/{m.total} ({m.doneRate}%)
                          {m.planStatus === "closed" ? ` · ${label.planStatus("closed")}` : null}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-0.5 text-[11px] text-amber-700">{t("dp_team_no_plan")}</p>
                    )}
                  </div>
                  {m.planId ? (
                    <Button size="sm" className="h-8 shrink-0 text-xs" onClick={() => void openMember(m)}>
                      {t("dp_team_open")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0 text-xs"
                      disabled={creatingId === m.employeeId}
                      onClick={() => void createMemberPlan(m)}
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      {creatingId === m.employeeId ? t("dp_team_creating") : t("dp_team_create")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}

      {view === "mine" ? (
        <>
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
                canDelegate={canDelegateMine}
                delegateTargets={teamMembers}
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
        </>
      ) : null}
    </div>
  )
}
