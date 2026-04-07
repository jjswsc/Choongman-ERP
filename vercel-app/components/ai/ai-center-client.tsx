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

const DEFAULT_PAYLOADS: Record<AiActionType, Record<string, unknown>> = {
  create_notice_draft: {
    title: "4월 운영 공지 초안",
    content: "공지 본문 초안",
    targetStore: "All",
  },
  create_followup_task: {
    taskTitle: "재고 회전율 점검",
    description: "AI 제안 기반 점검 태스크",
    owner: "",
    storeScope: "All",
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
    storeScope: "All",
    note: "AI센터 승인 실행",
    owner: "",
  },
  create_weather_campaign_draft: {
    title: "우천 예보 연계 배달 프로모션 초안",
    content: "강수확률 60% 이상일 때 배달앱 쿠폰/세트 프로모션 운영안",
    targetStore: "All",
  },
  create_shift_adjustment_draft: {
    taskTitle: "기상 악화 대비 인력 재배치 초안",
    description: "비 예보 피크시간대 조리/배달 인력 보강",
    owner: "",
    storeScope: "All",
    dueDate: "",
  },
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
  const sp = useSearchParams()
  const canApprove = canApproveAiActions(auth?.role || "")

  const [intent, setIntent] = React.useState<AiIntent>((sp.get("intent") as AiIntent) || "qa")
  const [query, setQuery] = React.useState(sp.get("q") || "")
  const [store, setStore] = React.useState(sp.get("store") || auth?.store || "All")
  const [start, setStart] = React.useState(sp.get("start") || "")
  const [end, setEnd] = React.useState(sp.get("end") || "")
  const [askLoading, setAskLoading] = React.useState(false)
  const [askRes, setAskRes] = React.useState<AiAskResponse | null>(null)
  const [askError, setAskError] = React.useState("")

  const [actionType, setActionType] = React.useState<AiActionType>("create_notice_draft")
  const [reason, setReason] = React.useState("운영 개선 요청 기반 AI 실행 초안")
  const [payloadText, setPayloadText] = React.useState(prettyJson(DEFAULT_PAYLOADS.create_notice_draft))
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
    setPayloadText(prettyJson(DEFAULT_PAYLOADS[next]))
  }

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
      setSyncMsg(`외부 환경 동기화 완료: ${res.synced}건`)
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
            <h1 className="text-xl font-semibold">AI 센터</h1>
            <p className="text-xs text-muted-foreground">
              질문/제안/승인 기반 실행을 한 곳에서 관리합니다.
            </p>
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
            새로고침
          </Button>
        </div>

        <Tabs defaultValue="qa" className="space-y-4">
          <TabsList>
            <TabsTrigger value="qa">질문/제안</TabsTrigger>
            <TabsTrigger value="actions">실행 초안</TabsTrigger>
            <TabsTrigger value="approvals">실행대기함/이력</TabsTrigger>
            <TabsTrigger value="metrics">품질/비용 지표</TabsTrigger>
          </TabsList>

          <TabsContent value="qa">
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                <div className="sm:col-span-1">
                  <p className="mb-1 text-xs text-muted-foreground">질문 유형</p>
                  <Select value={intent} onValueChange={(v) => setIntent(v as AiIntent)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="qa">일반 Q&A</SelectItem>
                      <SelectItem value="reporting">리포트 생성</SelectItem>
                      <SelectItem value="ops_recommend">운영 최적화 제안</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">매장</p>
                  <Input value={store} onChange={(e) => setStore(e.target.value)} placeholder="All" />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">시작일(방콕)</p>
                  <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">종료일(방콕)</p>
                  <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">질문</p>
                <Textarea
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="min-h-[110px]"
                  placeholder="예) 지난 4주간 매장별 매출/원가 변화를 보고 다음 주 발주 및 인력 배치 제안해줘."
                />
              </div>
              <Button type="button" onClick={() => void onAsk()} disabled={askLoading || !query.trim()}>
                {askLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                AI 답변 생성
              </Button>
              {askError && <p className="text-sm text-red-600">{askError}</p>}
              {askRes && (
                <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">답변</p>
                    <pre className="whitespace-pre-wrap text-sm leading-6">{askRes.answer}</pre>
                  </div>
                  {!!askRes.plan?.length && (
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">권장 실행 순서</p>
                      <ul className="list-disc pl-5 text-sm">
                        {askRes.plan.map((p, i) => (
                          <li key={`${p}-${i}`}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!askRes.citations?.length && (
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">참조 출처</p>
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
                      <p className="mb-1 text-xs text-muted-foreground">외부 환경 요약</p>
                      <p className="text-sm">{askRes.externalSummary}</p>
                    </div>
                  )}
                  {!!askRes.externalSignals?.length && (
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">외부 환경 상세 (최근)</p>
                      <div className="space-y-1">
                        {askRes.externalSignals.slice(0, 8).map((s, i) => (
                          <p key={`${s.date}-${i}`} className="text-xs text-muted-foreground">
                            {s.date} · {s.store} · {s.weatherText} · 강수확률 {s.rainProb ?? "-"}% ·
                            온도 {s.tempMinC ?? "-"}~{s.tempMaxC ?? "-"}C
                            {s.isHoliday ? ` · 휴일(${s.holidayName || "-"})` : ""}
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
                  <p className="mb-1 text-xs text-muted-foreground">액션 유형</p>
                  <Select value={actionType} onValueChange={(v) => onChangeActionType(v as AiActionType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="create_notice_draft">공지 초안 생성</SelectItem>
                      <SelectItem value="create_followup_task">후속 태스크 생성</SelectItem>
                      <SelectItem value="update_followup_task_status">후속 태스크 상태 변경</SelectItem>
                      <SelectItem value="save_accounting_workflow_status">회계 워크플로우 상태 저장</SelectItem>
                      <SelectItem value="create_weather_campaign_draft">날씨 연계 마케팅 초안</SelectItem>
                      <SelectItem value="create_shift_adjustment_draft">날씨 연계 인력조정 초안</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">실행 사유</p>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Payload(JSON)</p>
                <Textarea
                  className="min-h-[220px] font-mono text-xs"
                  value={payloadText}
                  onChange={(e) => setPayloadText(e.target.value)}
                />
              </div>
              <Button type="button" onClick={() => void onPropose()} disabled={proposalLoading}>
                {proposalLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                승인 요청 생성
              </Button>
              {actionError && <p className="text-sm text-red-600">{actionError}</p>}
              {proposalResult && (
                <div className="rounded-md border bg-muted/20 p-3 text-sm">
                  생성 완료: #{proposalResult.id} · {proposalResult.preview}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="approvals">
            <div className="rounded-lg border bg-card p-4 space-y-4">
              <div>
                <p className="text-sm font-medium">실행대기함 ({pending.length})</p>
                <div className="mt-2 space-y-2">
                  {historyLoading && <p className="text-sm text-muted-foreground">로딩 중...</p>}
                  {!historyLoading && pending.length === 0 && (
                    <p className="text-sm text-muted-foreground">대기 중인 요청이 없습니다.</p>
                  )}
                  {pending.map((row) => (
                    <div key={row.id} className="rounded border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">#{row.id} · {row.preview}</p>
                        <span className={`rounded px-2 py-0.5 text-xs ${statusBadge(row.status)}`}>{row.status}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.actionType} · 요청자 {row.requestedBy} ({row.requestedStore})
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
                          승인/실행
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void onApprove(row.id, false)}
                          disabled={!canApprove || approveLoadingId === row.id}
                        >
                          반려
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium">실행 이력</p>
                <div className="mt-2 space-y-2">
                  {history.slice(0, 20).map((row) => (
                    <div key={`h-${row.id}`} className="rounded border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs">#{row.id} · {row.preview}</p>
                        <span className={`rounded px-2 py-0.5 text-[11px] ${statusBadge(row.status)}`}>{row.status}</span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        요청 {row.requestedBy} · 승인 {row.approvedBy || "-"} · 실행 {row.executedAt || "-"}
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
                  날씨/휴일 데이터 동기화
                </Button>
                {!!syncMsg && <p className="text-xs text-muted-foreground">{syncMsg}</p>}
              </div>
              {metricsLoading && <p className="text-sm text-muted-foreground">지표 로딩 중...</p>}
              {metrics && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                  <div className="rounded border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">대기 승인</p>
                    <p className="text-lg font-semibold">{metrics.pendingApprovals}</p>
                  </div>
                  <div className="rounded border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">오늘 실행</p>
                    <p className="text-lg font-semibold">{metrics.executedToday}</p>
                  </div>
                  <div className="rounded border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">오늘 실패</p>
                    <p className="text-lg font-semibold">{metrics.failedToday}</p>
                  </div>
                  <div className="rounded border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">7일 성공률</p>
                    <p className="text-lg font-semibold">{metrics.successRate7d}%</p>
                  </div>
                  <div className="rounded border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">오늘 Prompt 토큰</p>
                    <p className="text-lg font-semibold">{metrics.promptTokensToday || 0}</p>
                  </div>
                  <div className="rounded border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">오늘 Total 토큰</p>
                    <p className="text-lg font-semibold">{metrics.totalTokensToday || 0}</p>
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                비용/토큰 상세는 추후 `ai_usage_logs` 테이블 연동으로 확장 예정입니다.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}

