import { NextRequest, NextResponse } from "next/server"
import { requireAiAccess } from "@/lib/ai/auth"
import { aiRateLimit } from "@/lib/ai/rate-limit"
import { retrieveKnowledgeContext } from "@/lib/ai/knowledge"
import { runChatCompletion } from "@/lib/ai/llm"
import { logAiUsage } from "@/lib/ai/audit"
import { getExternalContextSummary } from "@/lib/ai/external-context"
import { buildStaffingInsight, isStaffingQuestion } from "@/lib/ai/staffing-advisor"
import { buildStoreOpsInsight, isStoreOpsQuestion } from "@/lib/ai/store-ops-advisor"
import { applyAiDateRangePolicy, buildAiDataPolicy } from "@/lib/ai/policy"
import { isAiRouteError } from "@/lib/ai/errors"
import { buildAiIntentGuide, buildAiSystemPrompt, resolveAiResponseLanguage } from "@/lib/ai/llm-locale"
import type { AiIntent } from "@/lib/ai/types"

function parseIntent(raw: unknown): AiIntent {
  const v = String(raw || "").trim()
  if (v === "reporting" || v === "ops_recommend") return v
  return "qa"
}

function buildRuleBasedAnswer(input: {
  intent: AiIntent
  query: string
  contextBlock: string
  externalSummary: string
  citations: { title: string; source: string }[]
  staffingSummary?: string
  staffingLines?: string[]
  storeOpsSummary?: string
  storeOpsLines?: string[]
}): string {
  const intro =
    input.intent === "reporting"
      ? "현재는 모델 키 미설정 상태라 규칙 기반 리포트로 안내합니다."
      : input.intent === "ops_recommend"
        ? "현재는 모델 키 미설정 상태라 규칙 기반 운영 제안으로 안내합니다."
        : "현재는 모델 키 미설정 상태라 규칙 기반 Q&A로 안내합니다."
  const evidence = input.citations.length
    ? input.citations.slice(0, 3).map((c, i) => `${i + 1}. ${c.title} (${c.source})`).join("\n")
    : "내부 문서 근거를 찾지 못했습니다."
  const nextSteps =
    input.intent === "ops_recommend"
      ? "- 오늘 우선 실행 1개 선정\n- 담당자/기한 지정\n- 승인 요청 생성"
      : "- 필요한 항목 확인\n- 작업 초안 작성\n- 매니저 승인 후 진행"
  const hasStaffing = Boolean(input.staffingSummary)
  const hasStoreOps = Boolean(input.storeOpsSummary)
  const contextHint = hasStoreOps
    ? "매출·본사매입 집계 데이터를 기반으로 계산했습니다."
    : hasStaffing
    ? "인사/적정인원 데이터를 기반으로 계산했습니다."
    : input.contextBlock
      ? "내부 근거가 일부 존재합니다. 상세는 참조 출처를 확인하세요."
      : "내부 근거가 부족합니다. 관련 SOP/공지 문서 보강을 권장합니다."
  return [
    `질문: ${input.query}`,
    "",
    intro,
    contextHint,
    `외부 환경 요약: ${input.externalSummary}`,
    hasStaffing ? `인력 분석 요약: ${input.staffingSummary}` : "",
    hasStaffing && input.staffingLines?.length
      ? `세부:\n${input.staffingLines.map((l) => `- ${l}`).join("\n")}`
      : "",
    hasStoreOps ? `매출·매입 분석 요약: ${input.storeOpsSummary}` : "",
    hasStoreOps && input.storeOpsLines?.length
      ? `세부:\n${input.storeOpsLines.map((l) => `- ${l}`).join("\n")}`
      : "",
    "",
    "근거 출처:",
    evidence,
    "",
    "권장 진행:",
    nextSteps,
  ].join("\n")
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const access = await requireAiAccess(req)
  if (!access.ok) return access.response

  const rl = aiRateLimit(`ai:ask:${access.scoped.name}:${access.scoped.store}`, 50, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", code: "AI_RATE_LIMITED", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers }
    )
  }

  let body: Record<string, unknown> = {}
  const startedAt = Date.now()
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "AI_INVALID_JSON" }, { status: 400, headers })
  }

  const query = String(body.query || "").trim()
  const intent = parseIntent(body.intent)
  const lang = String(body.lang || "ko")
  const requestedStore = String(body.store || access.scoped.store || "All").trim()
  const dateRange = body.dateRange as { start?: string; end?: string } | undefined
  const requestedStart = String(dateRange?.start || "").trim().slice(0, 10)
  const requestedEnd = String(dateRange?.end || "").trim().slice(0, 10)
  const policy = buildAiDataPolicy({
    scoped: access.scoped,
    intent,
    requestedStore,
  })
  const store = policy.resolvedStore
  const ranged = applyAiDateRangePolicy({
    start: requestedStart,
    end: requestedEnd,
    maxDays: policy.maxDateRangeDays,
  })
  const start = ranged.start || ""
  const end = ranged.end || ""
  if (!query) {
    return NextResponse.json({ error: "query is required", code: "AI_QUERY_REQUIRED" }, { status: 400, headers })
  }

  const { chunks, citations } = await retrieveKnowledgeContext(query, access.scoped, 6)
  const staffing = isStaffingQuestion(query)
    ? await buildStaffingInsight({
        scoped: access.scoped,
        requestedStore: store,
      })
    : null
  const storeOps = isStoreOpsQuestion(query)
    ? await buildStoreOpsInsight({
        scoped: access.scoped,
        requestedStore: store,
        start,
        end,
        tenantId: access.scoped.auth.tenantId,
      })
    : null
  const external = await getExternalContextSummary({
    scoped: access.scoped,
    store,
    start: start || undefined,
    end: end || undefined,
    limit: 21,
  })
  const contextBlock = chunks
    .map((c, idx) => `[${idx + 1}] ${c.title}\nsource=${c.source}, updatedAt=${c.updatedAt || "-"}\n${c.content.slice(0, 1200)}`)
    .join("\n\n")
  const staffingBlock = staffing?.hasData
    ? `인력 분석 요약: ${staffing.summary}\n${(staffing.lines || []).map((l) => `- ${l}`).join("\n")}`
    : ""
  const storeOpsBlock = storeOps?.hasData
    ? `매출·매입 분석 요약: ${storeOps.summary}\n${(storeOps.lines || []).map((l) => `- ${l}`).join("\n")}`
    : ""

  const responseLang = resolveAiResponseLanguage(lang)
  const intentGuide = buildAiIntentGuide(intent, responseLang)
  const systemPrompt = buildAiSystemPrompt(lang)

  try {
    const llm = await runChatCompletion(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            `의도: ${intent}\n지침: ${intentGuide}\n` +
            `사용자 스코프: role=${access.scoped.role}, store=${access.scoped.store}\n` +
            `요청 매장: ${requestedStore}\n` +
            `정책 적용 매장: ${store}${policy.isStoreCoerced ? " (권한 정책으로 보정됨)" : ""}\n` +
            `기간: ${start || "-"} ~ ${end || "-"} (Asia/Bangkok 기준)\n` +
            `기간 정책: 최대 ${policy.maxDateRangeDays}일${ranged.isClamped ? " (요청 기간 보정됨)" : ""}\n` +
            `외부환경 요약: ${external.summaryText}\n` +
            `${staffingBlock ? `${staffingBlock}\n` : ""}` +
            `${storeOpsBlock ? `${storeOpsBlock}\n` : ""}` +
            `질문: ${query}\n\n` +
            `참조 컨텍스트:\n${contextBlock || "(없음)"}\n\n` +
            `외부환경 상세(JSON):\n${JSON.stringify(external.signals.slice(0, 14))}`,
        },
      ],
      { temperature: 0.2, maxTokens: 1200 }
    )

    const answer =
      llm.text ||
      buildRuleBasedAnswer({
        intent,
        query,
        contextBlock,
        externalSummary: external.summaryText,
        citations: citations.map((c) => ({ title: c.title, source: c.source })),
        staffingSummary: staffing?.hasData ? staffing.summary : undefined,
        staffingLines: staffing?.hasData ? staffing.lines : undefined,
        storeOpsSummary: storeOps?.hasData ? storeOps.summary : undefined,
        storeOpsLines: storeOps?.hasData ? storeOps.lines : undefined,
      })

    const plan =
      intent === "ops_recommend"
        ? [
            "우선순위 1개 실행안을 승인 요청으로 등록",
            "담당 매장·기한·담당자 지정",
            "실행대기함에서 승인 후 반영",
          ]
        : intent === "reporting"
          ? [
              "핵심 수치(매출·매입·인력) 재확인",
              "이상 구간 원인 가설 2~3개 정리",
              "후속 태스크 또는 공지 초안 생성",
            ]
          : [
              "답변 근거(출처·집계) 확인",
              "추가 확인이 필요하면 기간·매장 좁혀 재질의",
              "실행이 필요하면 승인 요청 생성",
            ]

    await logAiUsage({
      scoped: access.scoped,
      route: "/api/ai/ask",
      model: llm.model,
      promptTokens: llm.usage?.promptTokens,
      completionTokens: llm.usage?.completionTokens,
      totalTokens: llm.usage?.totalTokens,
      success: true,
      latencyMs: Date.now() - startedAt,
      note: `intent=${intent},tier=${policy.roleTier},storeScope=${policy.storeScope},store=${store}`,
    })

    return NextResponse.json(
      {
        answer,
        plan,
        meta: {
          requestedStore: policy.requestedStore,
          resolvedStore: policy.resolvedStore,
          isStoreCoerced: policy.isStoreCoerced,
          storeScope: policy.storeScope,
          requestedStart,
          requestedEnd,
          resolvedStart: start,
          resolvedEnd: end,
          maxDateRangeDays: policy.maxDateRangeDays,
          isDateRangeClamped: ranged.isClamped,
        },
        citations: [
          ...citations,
          ...(staffing?.hasData
            ? [
                {
                  id: "staffing-employees",
                  source: "erp-table",
                  title: "employees (재직 인원 산출)",
                  snippet: "store/job/sal_type/join_date/resign_date 기반 FTE 계산",
                  updatedAt: null,
                },
                {
                  id: "staffing-target",
                  source: "erp-table",
                  title: "store_job_headcount (적정 인원 목표)",
                  snippet: "store/job/target_count 기준 목표 인원 비교",
                  updatedAt: null,
                },
              ]
            : []),
          ...(storeOps?.hasData
            ? [
                {
                  id: "store-ops-sales",
                  source: "erp-aggregate",
                  title: "POS 완료 매출 (posSalesByStore 동일)",
                  snippet: storeOps.summary,
                  updatedAt: null,
                },
                {
                  id: "store-ops-hq-outbound",
                  source: "erp-aggregate",
                  title: "본사 창고 출고(매입)",
                  snippet: (storeOps.lines || []).join(" · "),
                  updatedAt: null,
                },
              ]
            : []),
        ],
        storeOpsMetrics: storeOps?.metrics ?? null,
        storeBreakdown: storeOps?.storeBreakdown ?? null,
        externalSummary: external.summaryText,
        externalSignals: external.signals.slice(0, 14),
        usage: llm.usage,
        model: llm.model,
      },
      { headers }
    )
  } catch (e) {
    console.error("ai/ask:", e)
    const code = isAiRouteError(e) ? e.code : "AI_INTERNAL_ERROR"
    const status = isAiRouteError(e) ? e.status : 500
    await logAiUsage({
      scoped: access.scoped,
      route: "/api/ai/ask",
      success: false,
      latencyMs: Date.now() - startedAt,
      note: e instanceof Error ? e.message : String(e),
    })
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e), code },
      { status, headers }
    )
  }
}

