"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Bot,
  ClipboardList,
  FileText,
  Gauge,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  Zap,
} from "lucide-react"
import { AdminTabsBarWithHelp } from "@/components/erp/admin-tabs-bar-with-help"
import {
  adminTabsContentCn,
  adminTabsListRowCn,
  adminTabsRootCn,
  adminTabsTriggerCn,
  adminTabsIconCn,
} from "@/lib/admin-tab-styles"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { AiSimpleMarkdown } from "@/components/ai/ai-simple-markdown"
import {
  AiCenterActionForm,
  buildActionPayloadFromForm,
  defaultActionFormValues,
  type AiActionFormValues,
} from "@/components/ai/ai-center-action-form"
import {
  AiCenterStoreSelect,
  AiPolicySummaryCard,
  AI_CENTER_ALL_STORE,
  aiStatusBadgeClass,
  prettyJson,
} from "@/components/ai/ai-center-shared"
import {
  askAiCenter,
  askAiCenterStream,
  approveAiAction,
  getAiActionHistory,
  getAiCenterHealth,
  getAiDrafts,
  getAiMetrics,
  getAiConversations,
  saveAiConversationTurn,
  syncExternalContext,
  proposeAiAction,
  AiApiError,
  type AiActionType,
  type AiAskResponse,
  type AiActionRequestRow,
  type AiConversationSummary,
  type AiIntent,
  type AiMetrics,
  type AiScopeMeta,
  type AiCenterHealthResponse,
} from "@/lib/ai-center-client"
import { resolveAiDatePreset, type AiDatePresetId } from "@/lib/ai-center-date-presets"
import { useAuth } from "@/lib/auth-context"
import { canApproveAiActions, isAccountingRole, isOfficeRole } from "@/lib/permissions"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useStoreList } from "@/lib/use-store-list"
import { filterPosSalesStoreOptionsForManagement } from "@/lib/pos-sales-test-office"
import { cn } from "@/lib/utils"

type AiCenterTab = "qa" | "actions" | "approvals" | "drafts" | "metrics"

const TAB_ICONS: Record<AiCenterTab, React.ComponentType<{ className?: string }>> = {
  qa: MessageSquare,
  actions: Zap,
  approvals: ClipboardList,
  drafts: FileText,
  metrics: Gauge,
}

function aiStatusLabel(t: (k: string) => string, status: string) {
  if (status === "executed") return t("aiCenterStatusExecuted")
  if (status === "failed") return t("aiCenterStatusFailed")
  if (status === "rejected") return t("aiCenterStatusRejected")
  if (status === "pending_approval") return t("aiCenterStatusPendingApproval")
  return status || t("aiCenterStatusUnknown")
}

function normalizeAiActionErrorMessage(t: (k: string) => string, err: unknown): string {
  const code = err instanceof AiApiError ? err.code : null
  if (code === "AI_RATE_LIMITED") return t("aiCenterRateLimit")
  if (code === "AI_APPROVAL_CONFLICT") return t("aiCenterApprovalConflict")
  if (code === "AI_APPROVER_REQUIRED") return t("aiCenterApproverOnlyHint")
  if (code === "AI_SCOPE_VIOLATION") return t("aiCenterScopeViolation")
  if (code === "AI_OFFICE_REQUIRED") return t("aiCenterOfficeOnlyHint")
  const raw = err instanceof Error ? err.message : String(err || "")
  if (raw.includes("request is not pending approval")) return t("aiCenterApprovalConflict")
  if (raw.includes("Approver role required")) return t("aiCenterApproverOnlyHint")
  return raw
}

function parseTab(raw: string | null): AiCenterTab {
  if (raw === "actions" || raw === "approvals" || raw === "drafts" || raw === "metrics") return raw
  return "qa"
}

function buildSuggestedPrompts(t: (k: string) => string, isOffice: boolean): string[] {
  const base = [
    t("aiCenterSuggestSalesRatio"),
    t("aiCenterSuggestStaffing"),
    t("aiCenterSuggestWeather"),
  ]
  if (isOffice) base.unshift(t("aiCenterSuggestMultiStore"))
  return base
}

export function AiCenterClient({ compact }: { compact?: boolean }) {
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const router = useRouter()
  const sp = useSearchParams()
  const { posStores: rawStores } = useStoreList()

  const stores = React.useMemo(
    () => filterPosSalesStoreOptionsForManagement(rawStores || []),
    [rawStores]
  )
  const canApprove = canApproveAiActions(auth?.role || "")
  const canSelectCrossStore = isOfficeRole(auth?.role || "") || isAccountingRole(auth?.role || "")

  const initialStore = React.useMemo(() => {
    if (typeof window !== "undefined" && compact) {
      try {
        return sessionStorage.getItem("ai_center_drawer_store") || auth?.store || AI_CENTER_ALL_STORE
      } catch {
        // ignore
      }
    }
    return sp.get("store") || auth?.store || AI_CENTER_ALL_STORE
  }, [compact, sp, auth?.store])

  const initialQuery = React.useMemo(() => {
    if (typeof window !== "undefined" && compact) {
      try {
        return sessionStorage.getItem("ai_center_drawer_prefill_q") || sp.get("q") || ""
      } catch {
        // ignore
      }
    }
    return sp.get("q") || ""
  }, [compact, sp])

  const [tab, setTab] = React.useState<AiCenterTab>(() => parseTab(sp.get("tab")))
  const [intent, setIntent] = React.useState<AiIntent>((sp.get("intent") as AiIntent) || "qa")
  const [query, setQuery] = React.useState(initialQuery)
  const [store, setStore] = React.useState(initialStore)
  const [start, setStart] = React.useState(sp.get("start") || resolveAiDatePreset("last30").start)
  const [end, setEnd] = React.useState(sp.get("end") || resolveAiDatePreset("last30").end)
  const [useStream, setUseStream] = React.useState(true)

  const [askLoading, setAskLoading] = React.useState(false)
  const [askRes, setAskRes] = React.useState<AiAskResponse | null>(null)
  const [streamingAnswer, setStreamingAnswer] = React.useState("")
  const [askError, setAskError] = React.useState("")

  const [actionType, setActionType] = React.useState<AiActionType>("create_notice_draft")
  const [reason, setReason] = React.useState(() => t("aiCenterDefaultReason"))
  const [formValues, setFormValues] = React.useState<AiActionFormValues>(() =>
    defaultActionFormValues("create_notice_draft", t)
  )
  const [showAdvancedJson, setShowAdvancedJson] = React.useState(false)
  const [payloadText, setPayloadText] = React.useState("")
  const [proposalLoading, setProposalLoading] = React.useState(false)
  const [proposalResult, setProposalResult] = React.useState<AiActionRequestRow | null>(null)
  const [actionError, setActionError] = React.useState("")

  const [history, setHistory] = React.useState<AiActionRequestRow[]>([])
  const [historyMeta, setHistoryMeta] = React.useState<AiScopeMeta | null>(null)
  const [historyLoading, setHistoryLoading] = React.useState(false)
  const [approveLoadingId, setApproveLoadingId] = React.useState<number | null>(null)
  const [rejectComment, setRejectComment] = React.useState("")

  const [metrics, setMetrics] = React.useState<AiMetrics | null>(null)
  const [metricsLoading, setMetricsLoading] = React.useState(false)
  const [syncLoading, setSyncLoading] = React.useState(false)
  const [syncMsg, setSyncMsg] = React.useState("")

  const [health, setHealth] = React.useState<AiCenterHealthResponse | null>(null)
  const [draftsLoading, setDraftsLoading] = React.useState(false)
  const [noticeDrafts, setNoticeDrafts] = React.useState<
    Awaited<ReturnType<typeof getAiDrafts>>["noticeDrafts"]
  >([])
  const [followupTasks, setFollowupTasks] = React.useState<
    Awaited<ReturnType<typeof getAiDrafts>>["followupTasks"]
  >([])
  const [conversationId, setConversationId] = React.useState<number | undefined>(undefined)
  const [conversations, setConversations] = React.useState<AiConversationSummary[]>([])
  const [conversationsLoading, setConversationsLoading] = React.useState(false)
  const [lastContinueUrl, setLastContinueUrl] = React.useState<string | null>(null)

  const opsStoreFilter = canSelectCrossStore ? store : auth?.store || AI_CENTER_ALL_STORE
  const suggestedPrompts = React.useMemo(
    () => buildSuggestedPrompts(t, canSelectCrossStore),
    [t, canSelectCrossStore]
  )

  React.useEffect(() => {
    if (!canSelectCrossStore && auth?.store) setStore(auth.store)
  }, [canSelectCrossStore, auth?.store])

  React.useEffect(() => {
    void getAiCenterHealth()
      .then(setHealth)
      .catch(() => setHealth(null))
  }, [])

  React.useEffect(() => {
    setFormValues(defaultActionFormValues(actionType, t))
    setReason(t("aiCenterDefaultReason"))
  }, [actionType, t])

  React.useEffect(() => {
    if (!showAdvancedJson) {
      setPayloadText(prettyJson(buildActionPayloadFromForm(actionType, formValues)))
    }
  }, [actionType, formValues, showAdvancedJson])

  const syncUrl = React.useCallback(
    (next: Partial<{ tab: AiCenterTab; q: string; store: string; start: string; end: string; intent: AiIntent }>) => {
      if (compact) return
      const params = new URLSearchParams(sp.toString())
      if (next.tab) params.set("tab", next.tab)
      if (next.q != null) params.set("q", next.q)
      if (next.store != null) params.set("store", next.store)
      if (next.start != null) params.set("start", next.start)
      if (next.end != null) params.set("end", next.end)
      if (next.intent) params.set("intent", next.intent)
      router.replace(`/admin/ai-center?${params.toString()}`, { scroll: false })
    },
    [compact, router, sp]
  )

  const onTabChange = (v: string) => {
    const next = parseTab(v)
    setTab(next)
    syncUrl({ tab: next })
  }

  const reloadHistory = React.useCallback(async () => {
    setHistoryLoading(true)
    try {
      const data = await getAiActionHistory(40, opsStoreFilter)
      setHistory(data.items || [])
      setHistoryMeta(data.meta || null)
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setHistoryLoading(false)
    }
  }, [opsStoreFilter])

  const reloadMetrics = React.useCallback(async () => {
    setMetricsLoading(true)
    try {
      setMetrics(await getAiMetrics(opsStoreFilter))
    } catch {
      // ignore
    } finally {
      setMetricsLoading(false)
    }
  }, [opsStoreFilter])

  const reloadDrafts = React.useCallback(async () => {
    setDraftsLoading(true)
    try {
      const data = await getAiDrafts(opsStoreFilter, 40)
      setNoticeDrafts(data.noticeDrafts || [])
      setFollowupTasks(data.followupTasks || [])
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e))
    } finally {
      setDraftsLoading(false)
    }
  }, [opsStoreFilter])

  const reloadConversations = React.useCallback(async () => {
    setConversationsLoading(true)
    try {
      const data = await getAiConversations(15)
      setConversations(data.items || [])
    } catch {
      setConversations([])
    } finally {
      setConversationsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void reloadHistory()
    void reloadMetrics()
    void reloadDrafts()
    void reloadConversations()
  }, [reloadHistory, reloadMetrics, reloadDrafts, reloadConversations])

  const persistConversation = React.useCallback(
    async (answer: string) => {
      if (!query.trim() || !answer.trim()) return
      try {
        const saved = await saveAiConversationTurn({
          conversationId,
          query,
          answer,
          intent,
        })
        setConversationId(saved.conversationId)
        void reloadConversations()
      } catch {
        // table may not exist yet
      }
    },
    [conversationId, query, intent, reloadConversations]
  )

  const onSyncExternal = React.useCallback(() => {
    setSyncLoading(true)
    setSyncMsg("")
    void syncExternalContext(7)
      .then((res) => setSyncMsg(`${t("aiCenterSyncComplete")}: ${res.synced}${t("aiCenterSyncCountSuffix")}`))
      .catch((e) => setSyncMsg(normalizeAiActionErrorMessage(t, e)))
      .finally(() => {
        setSyncLoading(false)
        void reloadMetrics()
      })
  }, [t, reloadMetrics])

  const onAsk = async () => {
    setAskLoading(true)
    setAskError("")
    setAskRes(null)
    setStreamingAnswer("")
    const payload = { query, intent, store, lang, dateRange: { start, end } }
    try {
      if (useStream) {
        let metaPartial: Partial<AiAskResponse> = {}
        let answerAcc = ""
        await askAiCenterStream(payload, {
          onMeta: (m) => {
            metaPartial = m
          },
          onDelta: (text) => {
            answerAcc += text
            setStreamingAnswer(answerAcc)
          },
          onDone: async ({ model, usage }) => {
            const finalAnswer = answerAcc
            setAskRes({
              answer: finalAnswer,
              citations: metaPartial.citations || [],
              meta: metaPartial.meta,
              externalSummary: metaPartial.externalSummary,
              storeOpsMetrics: metaPartial.storeOpsMetrics,
              storeBreakdown: metaPartial.storeBreakdown,
              model,
              usage,
              plan: [],
            })
            await persistConversation(finalAnswer)
          },
          onError: (msg) => setAskError(msg),
        })
        if (!answerAcc.trim()) {
          const res = await askAiCenter(payload)
          setAskRes(res)
          await persistConversation(res.answer)
        }
      } else {
        const res = await askAiCenter(payload)
        setAskRes(res)
        await persistConversation(res.answer)
      }
    } catch (e) {
      if (!useStream) setAskRes(null)
      setAskError(normalizeAiActionErrorMessage(t, e))
    } finally {
      setAskLoading(false)
    }
  }

  const displayAnswer = askRes?.answer || streamingAnswer

  const onChangeActionType = (next: AiActionType) => {
    setActionType(next)
    setFormValues(defaultActionFormValues(next, t))
  }

  const onPropose = async () => {
    setProposalLoading(true)
    setActionError("")
    try {
      const payload = showAdvancedJson
        ? (JSON.parse(payloadText) as Record<string, unknown>)
        : buildActionPayloadFromForm(actionType, formValues)
      const res = await proposeAiAction({ actionType, reason, payload })
      setProposalResult(res.request)
      await reloadHistory()
      await reloadMetrics()
      onTabChange("approvals")
    } catch (e) {
      setProposalResult(null)
      setActionError(normalizeAiActionErrorMessage(t, e))
    } finally {
      setProposalLoading(false)
    }
  }

  const onApprove = async (requestId: number, approve: boolean) => {
    setApproveLoadingId(requestId)
    setActionError("")
    try {
      const res = await approveAiAction({
        requestId,
        approve,
        comment: approve ? undefined : rejectComment || undefined,
      })
      if (approve && res.request.continueUrl) {
        setLastContinueUrl(res.request.continueUrl)
      }
      setRejectComment("")
      await reloadHistory()
      await reloadMetrics()
      await reloadDrafts()
    } catch (e) {
      setActionError(normalizeAiActionErrorMessage(t, e))
    } finally {
      setApproveLoadingId(null)
    }
  }

  const applyDatePreset = (id: AiDatePresetId) => {
    const r = resolveAiDatePreset(id)
    setStart(r.start)
    setEnd(r.end)
    syncUrl({ start: r.start, end: r.end })
  }

  const createActionFromAnswer = (type: AiActionType) => {
    onChangeActionType(type)
    if (type === "create_notice_draft" || type === "create_weather_campaign_draft") {
      setFormValues({
        title: t("aiCenterFromAnswerNoticeTitle"),
        content: displayAnswer.slice(0, 8000),
        targetStore: store || AI_CENTER_ALL_STORE,
      })
    } else if (type === "create_followup_task" || type === "create_shift_adjustment_draft") {
      setFormValues({
        taskTitle: t("aiCenterFromAnswerTaskTitle"),
        description: displayAnswer.slice(0, 4000),
        owner: "",
        storeScope: store || AI_CENTER_ALL_STORE,
        dueDate: "",
      })
    }
    onTabChange("actions")
  }

  const pending = history.filter((h) => h.status === "pending_approval")
  const openaiConfigured = health?.openaiConfigured ?? null

  const tabs: { id: AiCenterTab; label: string; badge?: number }[] = [
    { id: "qa", label: t("aiCenterTabQa") },
    { id: "actions", label: t("aiCenterTabActions") },
    { id: "approvals", label: t("aiCenterTabApprovals"), badge: pending.length },
    { id: "drafts", label: t("aiCenterTabDrafts") },
    { id: "metrics", label: t("aiCenterTabMetrics") },
  ]

  return (
    <div className={cn(compact ? "space-y-3 p-3" : "mx-auto max-w-6xl space-y-4 p-4 sm:p-6")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            <h1 className={cn("font-semibold", compact ? "text-lg" : "text-xl")}>{t("aiCenter")}</h1>
            {openaiConfigured === true ? (
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
                {t("aiCenterLlmReadyShort")}
              </Badge>
            ) : openaiConfigured === false ? (
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100">
                {t("aiCenterLlmNotConfiguredShort")}
              </Badge>
            ) : null}
          </div>
          {!compact ? <p className="text-xs text-muted-foreground">{t("aiCenterSubtitle")}</p> : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            void reloadHistory()
            void reloadMetrics()
            void reloadDrafts()
          }}
        >
          <RefreshCw className="h-4 w-4" />
          {t("store_refresh")}
        </Button>
      </div>

      {health && !health.allTablesOk ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-950 dark:text-amber-100">
          <p className="font-medium">{t("aiCenterHealthDbIssue")}</p>
          <p className="mt-1 opacity-90">{health.nextActions?.[0]}</p>
        </div>
      ) : null}
      {health?.openaiConfigured && health.vectorSearchReady === false ? (
        <div className="rounded-lg border border-blue-500/25 bg-blue-500/5 px-3 py-2 text-xs text-blue-950 dark:text-blue-100">
          <p className="font-medium">{t("aiCenterHealthVectorPending")}</p>
          <p className="mt-1 opacity-90">{health.nextActions?.find((a) => a.includes("vector")) || health.nextActions?.[0]}</p>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={onTabChange} className={adminTabsRootCn}>
        <AdminTabsBarWithHelp>
          <TabsList className={adminTabsListRowCn}>
            {tabs.map((item) => {
              const Icon = TAB_ICONS[item.id]
              return (
                <TabsTrigger key={item.id} value={item.id} className={adminTabsTriggerCn}>
                  <Icon className={adminTabsIconCn} />
                  {item.label}
                  {item.badge ? (
                    <Badge variant="secondary" className="ml-1 h-5 min-w-5 px-1 text-[10px]">
                      {item.badge}
                    </Badge>
                  ) : null}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </AdminTabsBarWithHelp>

        <TabsContent value="qa" className={adminTabsContentCn}>
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterQuestionType")}</p>
                <Select value={intent} onValueChange={(v) => setIntent(v as AiIntent)}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qa">{t("aiCenterIntentQa")}</SelectItem>
                    <SelectItem value="reporting">{t("aiCenterIntentReporting")}</SelectItem>
                    <SelectItem value="ops_recommend">{t("aiCenterIntentOpsRecommend")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("stockFilterStore")}</p>
                <AiCenterStoreSelect
                  value={store}
                  onChange={(v) => {
                    setStore(v)
                    syncUrl({ store: v })
                  }}
                  stores={stores}
                  canSelectAll={canSelectCrossStore}
                  allLabel={t("aiCenterPlaceholderAll")}
                  className="h-9"
                  disabled={!canSelectCrossStore && !!auth?.store}
                />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterStartDateBangkok")}</p>
                <Input type="date" className="h-9" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterEndDateBangkok")}</p>
                <Input type="date" className="h-9" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["today", t("aiCenterDatePresetToday")],
                  ["last7", t("aiCenterDatePreset7d")],
                  ["last30", t("aiCenterDatePreset30d")],
                  ["thisMonth", t("aiCenterDatePresetMonth")],
                  ["lastMonth", t("aiCenterDatePresetPrevMonth")],
                ] as const
              ).map(([id, label]) => (
                <Button key={id} type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyDatePreset(id)}>
                  {label}
                </Button>
              ))}
            </div>

            {conversations.length > 0 || conversationsLoading ? (
              <div className="rounded-lg border bg-muted/10 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">{t("aiCenterConversationHistory")}</p>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => void reloadConversations()}>
                    {t("store_refresh")}
                  </Button>
                </div>
                {conversationsLoading ? (
                  <p className="text-xs text-muted-foreground">{t("loading")}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {conversations.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="max-w-full truncate rounded-md border px-2 py-1 text-left text-xs hover:bg-muted/50"
                        title={c.title}
                        onClick={() => {
                          setConversationId(c.id)
                          setQuery(c.title)
                        }}
                      >
                        {c.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary hover:bg-primary/10"
                  onClick={() => setQuery(p)}
                >
                  <Sparkles className="h-3 w-3" />
                  {p}
                </button>
              ))}
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

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => void onAsk()} disabled={askLoading || !query.trim()}>
                {askLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("aiCenterGenerateAnswer")}
              </Button>
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={useStream} onChange={(e) => setUseStream(e.target.checked)} />
                {t("aiCenterStreamToggle")}
              </label>
            </div>

            {askError ? <p className="text-sm text-red-600">{askError}</p> : null}

            {(displayAnswer || askRes) && (
              <div className="space-y-3 rounded-xl border bg-muted/15 p-4">
                {askRes?.meta ? (
                  <AiPolicySummaryCard t={t} meta={askRes.meta} includeDatePolicy />
                ) : null}
                {askRes?.storeOpsMetrics ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <MetricTile label={t("aiCenterMetricSales")} value={formatNum(askRes.storeOpsMetrics.salesTotal)} />
                    <MetricTile label={t("aiCenterMetricHqPurchase")} value={formatNum(askRes.storeOpsMetrics.hqOutboundTotal)} />
                    <MetricTile
                      label={t("aiCenterMetricRatio")}
                      value={
                        askRes.storeOpsMetrics.ratioPct != null
                          ? `${askRes.storeOpsMetrics.ratioPct.toFixed(1)}%`
                          : "-"
                      }
                    />
                    <MetricTile label={t("aiCenterMetricOrders")} value={String(askRes.storeOpsMetrics.completedOrders)} />
                  </div>
                ) : null}
                {askRes?.storeBreakdown && askRes.storeBreakdown.length > 1 ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead className="bg-muted/40 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">{t("stockFilterStore")}</th>
                          <th className="px-3 py-2 text-right font-medium">{t("aiCenterMetricSales")}</th>
                          <th className="px-3 py-2 text-right font-medium">{t("aiCenterMetricHqPurchase")}</th>
                          <th className="px-3 py-2 text-right font-medium">{t("aiCenterMetricRatio")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {askRes.storeBreakdown.map((row) => (
                          <tr key={row.store} className="border-t">
                            <td className="px-3 py-2 font-medium">{row.store}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatNum(row.salesTotal)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatNum(row.hqOutboundTotal)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {row.ratioPct != null ? `${row.ratioPct.toFixed(1)}%` : "-"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">{t("aiCenterAnswer")}</p>
                  <AiSimpleMarkdown text={displayAnswer} />
                </div>
                {!!askRes?.plan?.length && (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterRecommendedPlan")}</p>
                    <ul className="list-disc pl-5 text-sm">
                      {askRes.plan.map((p, i) => (
                        <li key={`${p}-${i}`}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {displayAnswer ? (
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    <Button type="button" size="sm" variant="secondary" onClick={() => createActionFromAnswer("create_followup_task")}>
                      {t("aiCenterCreateTaskFromAnswer")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => createActionFromAnswer("create_notice_draft")}>
                      {t("aiCenterCreateNoticeFromAnswer")}
                    </Button>
                  </div>
                ) : null}
                {!!askRes?.citations?.length && (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterCitations")}</p>
                    <div className="space-y-2">
                      {askRes.citations.map((c) => (
                        <div key={c.id} className="rounded-lg border bg-background p-2">
                          <p className="text-xs font-medium">{c.title}</p>
                          <p className="text-xs text-muted-foreground">{c.source}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{c.snippet}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="actions" className={adminTabsContentCn}>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">{t("aiCenterActionType")}</p>
                <Select value={actionType} onValueChange={(v) => onChangeActionType(v as AiActionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
            <AiCenterActionForm
              t={t}
              actionType={actionType}
              values={formValues}
              onChange={setFormValues}
              stores={stores}
              canSelectAllStore={canSelectCrossStore}
              showAdvancedJson={showAdvancedJson}
              payloadText={payloadText}
              onPayloadTextChange={setPayloadText}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => void onPropose()} disabled={proposalLoading}>
                {proposalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("aiCenterCreateApprovalRequest")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdvancedJson((v) => !v)}>
                {showAdvancedJson ? t("aiCenterHideJson") : t("aiCenterShowJson")}
              </Button>
            </div>
            {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}
            {proposalResult ? (
              <div className="rounded-lg border bg-muted/20 p-3 text-sm">
                {t("aiCenterProposalCreated")}: #{proposalResult.id} · {proposalResult.preview}
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="approvals" className={adminTabsContentCn}>
          <div className="space-y-4">
            {lastContinueUrl ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <p className="text-sm">{t("aiCenterContinueAfterExecute")}</p>
                <Button size="sm" asChild>
                  <Link href={lastContinueUrl}>{t("aiCenterContinueOpen")}</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setLastContinueUrl(null)}>
                  {t("close")}
                </Button>
              </div>
            ) : null}
            <div>
              <p className="text-sm font-medium">
                {t("aiCenterPendingQueue")} ({pending.length})
              </p>
              <AiPolicySummaryCard t={t} meta={historyMeta} />
              {!canApprove ? <p className="mt-1 text-xs text-muted-foreground">{t("aiCenterApproverOnlyHint")}</p> : null}
              <div className="mt-2 space-y-2">
                {historyLoading ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : null}
                {!historyLoading && pending.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("aiCenterNoPendingRequests")}</p>
                ) : null}
                {pending.map((row) => (
                  <div key={row.id} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium">#{row.id} · {row.preview}</p>
                      <span className={cn("rounded px-2 py-0.5 text-xs", aiStatusBadgeClass(row.status))}>
                        {aiStatusLabel(t, row.status)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.actionType} · {t("aiCenterRequestedBy")} {row.requestedBy} ({row.requestedStore})
                    </p>
                    <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded bg-muted/40 p-2 text-xs">
                      {prettyJson(row.payload)}
                    </pre>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => void onApprove(row.id, true)} disabled={!canApprove || approveLoadingId === row.id}>
                        {approveLoadingId === row.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                        {t("aiCenterApproveExecute")}
                      </Button>
                      <Input
                        className="h-8 max-w-xs text-xs"
                        placeholder={t("aiCenterApproveCommentPlaceholder")}
                        value={rejectComment}
                        onChange={(e) => setRejectComment(e.target.value)}
                      />
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
                  <div key={`h-${row.id}`} className="rounded-lg border p-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs">#{row.id} · {row.preview}</p>
                      <span className={cn("rounded px-2 py-0.5 text-[11px]", aiStatusBadgeClass(row.status))}>
                        {aiStatusLabel(t, row.status)}
                      </span>
                    </div>
                    {row.error ? <p className="mt-1 text-[11px] text-red-600">{row.error}</p> : null}
                    {row.continueUrl ? (
                      <Button variant="link" size="sm" className="mt-1 h-auto p-0 text-xs" asChild>
                        <Link href={row.continueUrl}>{t("aiCenterContinueOpen")}</Link>
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="drafts" className={adminTabsContentCn}>
          {draftsLoading ? <p className="text-sm text-muted-foreground">{t("loading")}</p> : null}
          <p className="mb-3 text-xs text-muted-foreground">{t("aiCenterDraftsHint")}</p>
          <div className="grid gap-4 lg:grid-cols-2">
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">{t("aiCenterDraftsNotices")}</p>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                  <Link href="/admin/notices">{t("aiCenterGoNotices")}</Link>
                </Button>
              </div>
              <div className="space-y-2">
                {noticeDrafts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("aiCenterDraftEmpty")}</p>
                ) : (
                  noticeDrafts.map((d) => (
                    <div key={d.id} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{d.content}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        #{d.id} · {d.targetStore} · {d.createdBy}
                      </p>
                      {d.continueUrl ? (
                        <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" asChild>
                          <Link href={d.continueUrl}>{t("aiCenterContinueNotice")}</Link>
                        </Button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>
            <section>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-medium">{t("aiCenterDraftsTasks")}</p>
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" asChild>
                  <Link href="/admin/work-log">{t("aiCenterGoWorkLog")}</Link>
                </Button>
              </div>
              <div className="space-y-2">
                {followupTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("aiCenterDraftEmpty")}</p>
                ) : (
                  followupTasks.map((task) => (
                    <div key={task.id} className="rounded-lg border p-3">
                      <p className="text-sm font-medium">{task.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        #{task.id} · {task.storeScope} · {task.status}
                      </p>
                      {task.continueUrl ? (
                        <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" asChild>
                          <Link href={task.continueUrl}>{t("aiCenterContinueWorkLog")}</Link>
                        </Button>
                      ) : null}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="metrics" className={adminTabsContentCn}>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {canSelectCrossStore ? (
                <AiCenterStoreSelect
                  value={store}
                  onChange={setStore}
                  stores={stores}
                  canSelectAll={canSelectCrossStore}
                  allLabel={t("aiCenterPlaceholderAll")}
                  className="h-8 w-44"
                />
              ) : null}
              <Button type="button" size="sm" variant="outline" onClick={() => void onSyncExternal()} disabled={syncLoading}>
                {syncLoading && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                {t("aiCenterSyncWeatherHoliday")}
              </Button>
              {syncMsg ? <p className="text-xs text-muted-foreground">{syncMsg}</p> : null}
            </div>
            <AiPolicySummaryCard t={t} meta={metrics?.meta || null} />
            {metricsLoading ? <p className="text-sm text-muted-foreground">{t("aiCenterMetricsLoading")}</p> : null}
            {metrics ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {[
                  [t("aiCenterMetricPendingApprovals"), metrics.pendingApprovals],
                  [t("aiCenterMetricExecutedToday"), metrics.executedToday],
                  [t("aiCenterMetricFailedToday"), metrics.failedToday],
                  [t("aiCenterMetricSuccessRate7d"), `${metrics.successRate7d}%`],
                  [t("aiCenterMetricPromptTokensToday"), metrics.promptTokensToday || 0],
                  [t("aiCenterMetricTotalTokensToday"), metrics.totalTokensToday || 0],
                ].map(([label, val]) => (
                  <div key={String(label)} className="rounded-lg border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-lg font-semibold">{val}</p>
                  </div>
                ))}
              </div>
            ) : null}
            <p className="text-xs text-muted-foreground">{t("aiCenterMetricsCostNote")}</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

function formatNum(n: number) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(Math.round(n))
}
