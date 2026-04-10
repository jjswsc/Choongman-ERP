"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, RefreshCw } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  askAiCenter,
  approveAiAction,
  getAiActionHistory,
  getAiMetrics,
  syncExternalContext,
  proposeAiAction,
  type AiActionType,
  type AiAskResponse,
  type AiActionRequestRow,
  type AiIntent,
  type AiMetrics,
} from "@/lib/ai-center-client"
import { useAuth } from "@/lib/auth-context"
import { canApproveAiActions } from "@/lib/permissions"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

function buildDefaultAiPayloads(t: (k: string) => string): Record<AiActionType, Record<string, unknown>> {
  const storeScopeAll = "All"
  return {
    create_notice_draft: {
      title: t("aiCenterSampleNoticeTitle"),
      content: t("aiCenterSampleNoticeContent"),
      targetStore: storeScopeAll,
    },
    create_followup_task: {
      taskTitle: t("aiCenterSampleTaskTitle"),
      description: t("aiCenterSampleTaskDesc"),
      owner: "",
      storeScope: storeScopeAll,
      dueDate: "",
    },
    update_followup_task_status: {
      taskId: 1,
      status: "in_progress",
    },
    save_accounting_workflow_status: {
      yearMonth: "2026-04",
      filingType: "vat",
      status: "in_progress",
      storeScope: storeScopeAll,
      note: t("aiCenterSampleAccountingNote"),
      owner: "",
    },
    create_weather_campaign_draft: {
      title: t("aiCenterSampleWeatherTitle"),
      content: t("aiCenterSampleWeatherContent"),
      targetStore: storeScopeAll,
    },
    create_shift_adjustment_draft: {
      taskTitle: t("aiCenterSampleShiftTitle"),
      description: t("aiCenterSampleShiftDesc"),
      owner: "",
      storeScope: storeScopeAll,
      dueDate: "",
    },
  }
}

function aiStatusLabel(t: (k: string) => string, status: string) {
  if (status === "executed") return t("aiCenterStatusExecuted")
  if (status === "failed") return t("aiCenterStatusFailed")
  if (status === "rejected") return t("aiCenterStatusRejected")
  if (status === "pending_approval") return t("aiCenterStatusPendingApproval")
  return status || t("aiCenterStatusUnknown")
}

function prettyJson(v: unknown) {
  return JSON.stringify(v, null, 2)
}

function statusBadge(status: string) {
  if (status === "executed") return "bg-emerald-100 text-emerald-700"
  if (status === "failed") return "bg-red-100 text-red-700"
  if (status === "rejected") return "bg-slate-100 text-slate-700"
  if (status === "pending_approval") return "bg-amber-100 text-amber-700"
  return "bg-blue-100 text-blue-700"
}

export function AiCenterClient() {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const sp = useSearchParams()
  const canApprove = canApproveAiActions(auth?.role || "")

  const defaultPayloads = React.useMemo(() => buildDefaultAiPayloads(t), [t])

  const [intent, setIntent] = React.useState<AiIntent>((sp.get("intent") as AiIntent) || "qa")
  const [query, setQuery] = React.useState(sp.get("q") || "")
  const [store, setStore] = React.useState(sp.get("store") || auth?.store || "All")
  const [start, setStart] = React.useState(sp.get("start") || "")
  const [end, setEnd] = React.useState(sp.get("end") || "")
  const [askLoading, setAskLoading] = React.useState(false)
  const [askRes, setAskRes] = React.useState<AiAskResponse | null>(null)
  const [askError, setAskError] = React.useState("")

  const [actionType, setActionType] = React.useState<AiActionType>("create_notice_draft")
  const [reason, setReason] = React.useState(() => t("aiCenterDefaultReason"))
  const [payloadText, setPayloadText] = React.useState(() => prettyJson(buildDefaultAiPayloads(t).create_notice_draft))
  const [proposalLoading, setProposalLoading] = React.useState(false)
  const [proposalResult, setProposalResult] = React.useState<AiActionRequestRow | null>(null)
  const [actionError, setActionError] = React.useState("")

  const [history, setHistory] = React.useState<AiActionRequestRow[]>([])
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [approveLoadingId, setApproveLoadingId] = React.useState<number | null>(null)

  const [metrics, setMetrics] = React.useState<AiMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = React.useState(false)
  const [syncLoading, setSyncLoading] = React.useState(false)
  const [syncMsg, setSyncMsg] = React.useState("")

  const reloadHistory = React.useCallback(async () => {
    setHistoryLoading(true)
    try {
      const data = await getAiActionHistory(40)
      setHistory(data.items || [])
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const reloadMetrics = React.useCallback(async () => {
    setMetricsLoading(true)
    try {
      setMetrics(await getAiMetrics())
    } catch {
      // ignore
    } finally {
      setMetricsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void reloadHistory()
    void reloadMetrics()
  }, [reloadHistory, reloadMetrics])

  const onAsk = async () => {
    setAskLoading(true)
    setAskError("")
    try {
      const res = await askAiCenter({
        query,
        intent,
        store,
        dateRange: { start, end },
      })
      setAskRes(res)
    } catch (e) {
      setAskRes(null)
      setAskError(e instanceof Error ? e.message : String(e))
    } finally {
      setAskLoading(false)
    }
  }

  const onChangeActionType = (next: AiActionType) => {
    setActionType(next)
    setPayloadText(prettyJson(defaultPayloads[next]))
  }

  React.useEffect(() => {
    setReason(t("aiCenterDefaultReason"))
    setPayloadText(prettyJson(defaultPayloads[actionType]))
    // 언어(번역) 변경 시에만 샘플·사유를 로케일에 맞게 다시 채움. actionType 변경은 onChangeActionType에서 처리.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- actionType은 의도적으로 제외
  }, [defaultPayloads])

  const onPropose = async () => {
    setProposalLoading(true)
    setActionError("")
    try {
      const payload = JSON.parse(payloadText) as Record<string, unknown>
      const res = await proposeAiAction({ actionType, reason, payload })
      setProposalResult(res.request)
      await reloadHistory()
      await reloadMetrics()
    } catch (e) {
      setProposalResult(null)
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setProposalLoading(false)
    }
  }

  const onApprove = async (requestId: number, approve: boolean) => {
    setApproveLoadingId(requestId)
    setActionError("")
    try {
      await approveAiAction({ requestId, approve })
      await reloadHistory()
      await reloadMetrics()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setApproveLoadingId(null)
    }
  }

  const onSyncExternal = async () => {
    setSyncLoading(true)
    setSyncMsg("")
    try {
      const res = await syncExternalContext(7)
      setSyncMsg(`${t("aiCenterSyncComplete")}: ${res.synced}${t("aiCenterSyncCountSuffix")}`)
      await reloadMetrics()
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSyncLoading(false)
    }
  }

  const pending = history.filter((h) => h.status === "pending_approval")

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">{t("aiCenter")}</h1>
            <p className="text-xs text-muted-foreground">{t("aiCenterSubtitle")}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => {
              void reloadHistory()
              void reloadMetrics()
            }}
          >
            <RefreshCw className="h-4 w-4" />
            {t("store_refresh")}
          </Button>
        </div>

        <Tabs defaultValue="qa" className="space-y-4">
          <TabsList>
            <TabsTrigger value="qa">{t("aiCenterTabQa")}</TabsTrigger>
            <TabsTrigger value="actions">{t("aiCenterTabActions")}</TabsTrigger>
            <TabsTrigger value="approvals">{t("aiCenterTabApprovals")}</TabsTrigger>
            <TabsTrigger value="metrics">{t("aiCenterTabMetrics")}</TabsTrigger>
          </TabsList>

          <TabsContent value="qa">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <div className="sm:col-span-1">
                  <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterQuestionType")}</p>
                  <Select value={intent} onValueChange={(v) => setIntent(v as AiIntent)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="qa">{t("aiCenterIntentQa")}</SelectItem>
                      <SelectItem value="reporting">{t("aiCenterIntentReporting")}</SelectItem>
                      <SelectItem value="ops_recommend">{t("aiCenterIntentOpsRecommend")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">{t("stockFilterStore")}</p>
                  <Input value={store} onChange={(e) => setStore(e.target.value)} placeholder={t("aiCenterPlaceholderAll")} />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterStartDateBangkok")}</p>
                  <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterEndDateBangkok")}</p>
                  <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterQuestion")}</p>
                <Textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="min-h-[110px]"
                  placeholder={t("aiCenterQuestionPlaceholder")}
                />
              </div>
              <Button type="button" onClick={() => void onAsk()} disabled={askLoading || !query.trim()}>
                {askLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("aiCenterGenerateAnswer")}
              </Button>
              {askError && <p className="text-sm text-red-600">{askError}</p>}
              {askRes && (
                <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterAnswer")}</p>
                    <pre className="whitespace-pre-wrap text-sm leading-6">{askRes.answer}</pre>
                  </div>
                  {!!askRes.plan?.length && (
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterRecommendedPlan")}</p>
                      <ul className="list-disc pl-5 text-sm">
                        {askRes.plan.map((p, i) => (
                          <li key={`${p}-${i}`}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!askRes.citations?.length && (
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterCitations")}</p>
                      <div className="space-y-2">
                        {askRes.citations.map((c) => (
                          <div key={c.id} className="rounded border bg-background p-2">
                            <p className="text-xs font-medium">{c.title}</p>
                            <p className="text-xs text-muted-foreground">{c.source} · {c.updatedAt || "-"}</p>
                            <p className="mt-1 text-xs text-muted-foreground">{c.snippet}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!!askRes.externalSummary && (
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterExternalSummary")}</p>
                      <p className="text-sm">{askRes.externalSummary}</p>
                    </div>
                  )}
                  {!!askRes.externalSignals?.length && (
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterExternalDetail")}</p>
                      <div className="space-y-1">
                        {askRes.externalSignals.slice(0, 8).map((s, i) => (
                          <p key={`${s.date}-${i}`} className="text-xs text-muted-foreground">
                            {s.date} · {s.store} · {s.weatherText} · {t("aiCenterRainProbLabel")}{" "}
                            {s.rainProb ?? "-"}% · {t("aiCenterTempLabel")} {s.tempMinC ?? "-"}~{s.tempMaxC ?? "-"}°C
                            {s.isHoliday ? ` · ${t("aiCenterHolidayShort")}(${s.holidayName || "-"})` : ""}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="actions">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterActionType")}</p>
                  <Select value={actionType} onValueChange={(v) => onChangeActionType(v as AiActionType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="create_notice_draft">{t("aiCenterActionCreateNoticeDraft")}</SelectItem>
                      <SelectItem value="create_followup_task">{t("aiCenterActionCreateFollowupTask")}</SelectItem>
                      <SelectItem value="update_followup_task_status">{t("aiCenterActionUpdateFollowupTaskStatus")}</SelectItem>
                      <SelectItem value="save_accounting_workflow_status">{t("aiCenterActionSaveAccountingWorkflow")}</SelectItem>
                      <SelectItem value="create_weather_campaign_draft">{t("aiCenterActionCreateWeatherCampaignDraft")}</SelectItem>
                      <SelectItem value="create_shift_adjustment_draft">{t("aiCenterActionCreateShiftAdjustmentDraft")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterExecutionReason")}</p>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterPayloadJson")}</p>
                <Textarea
                  className="min-h-[220px] font-mono text-xs"
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                />
              </div>
              <Button type="button" onClick={() => void onPropose()} disabled={proposalLoading}>
                {proposalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("aiCenterCreateApprovalRequest")}
              </Button>
              {actionError && <p className="text-sm text-red-600">{actionError}</p>}
              {proposalResult && (
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  {t("aiCenterProposalCreated")}: #{proposalResult.id} · {proposalResult.preview}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="approvals">
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <div>
                <p className="text-sm font-medium">
                  {t("aiCenterPendingQueue")} ({pending.length})
                </p>
                <div className="mt-2 space-y-2">
                  {historyLoading && <p className="text-sm text-muted-foreground">{t("loading")}</p>}
                  {!historyLoading && pending.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("aiCenterNoPendingRequests")}</p>
                  )}
                  {pending.map((row) => (
                    <div key={row.id} className="rounded border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">#{row.id} · {row.preview}</p>
                        <span className={`rounded px-2 py-0.5 text-xs ${statusBadge(row.status)}`}>
                          {aiStatusLabel(t, row.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.actionType} · {t("aiCenterRequestedBy")} {row.requestedBy} ({row.requestedStore})
                      </p>
                      <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">
                        {prettyJson(row.payload)}
                      </pre>
                      <div className="mt-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => void onApprove(row.id, true)}
                          disabled={!canApprove || approveLoadingId === row.id}
                        >
                          {approveLoadingId === row.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                          {t("aiCenterApproveExecute")}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void onApprove(row.id, false)}
                          disabled={!canApprove || approveLoadingId === row.id}
                        >
                          {t("aiCenterReject")}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium">{t("aiCenterExecutionHistory")}</p>
                <div className="mt-2 space-y-2">
                  {history.slice(0, 20).map((row) => (
                    <div key={`h-${row.id}`} className="rounded border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs">#{row.id} · {row.preview}</p>
                        <span className={`rounded px-2 py-0.5 text-[11px] ${statusBadge(row.status)}`}>
                          {aiStatusLabel(t, row.status)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {t("aiCenterLabelRequested")} {row.requestedBy} · {t("aiCenterLabelApproved")}{" "}
                        {row.approvedBy || "-"} · {t("aiCenterLabelExecuted")} {row.executedAt || "-"}
                      </p>
                      {row.error && <p className="mt-1 text-[11px] text-red-600">{row.error}</p>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="metrics">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => void onSyncExternal()} disabled={syncLoading}>
                  {syncLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  {t("aiCenterSyncWeatherHoliday")}
                </Button>
                {!!syncMsg && <p className="text-xs text-muted-foreground">{syncMsg}</p>}
              </div>
              {metricsLoading && <p className="text-sm text-muted-foreground">{t("aiCenterMetricsLoading")}</p>}
              {metrics && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{t("aiCenterMetricPendingApprovals")}</p>
                    <p className="text-lg font-semibold">{metrics.pendingApprovals}</p>
                  </div>
                  <div className="rounded border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{t("aiCenterMetricExecutedToday")}</p>
                    <p className="text-lg font-semibold">{metrics.executedToday}</p>
                  </div>
                  <div className="rounded border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{t("aiCenterMetricFailedToday")}</p>
                    <p className="text-lg font-semibold">{metrics.failedToday}</p>
                  </div>
                  <div className="rounded border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{t("aiCenterMetricSuccessRate7d")}</p>
                    <p className="text-lg font-semibold">{metrics.successRate7d}%</p>
                  </div>
                  <div className="rounded border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{t("aiCenterMetricPromptTokensToday")}</p>
                    <p className="text-lg font-semibold">{metrics.promptTokensToday || 0}</p>
                  </div>
                  <div className="rounded border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{t("aiCenterMetricTotalTokensToday")}</p>
                    <p className="text-lg font-semibold">{metrics.totalTokensToday || 0}</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">{t("aiCenterMetricsCostNote")}</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}

