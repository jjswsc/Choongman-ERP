import { NextRequest, NextResponse } from "next/server"
import { requireAiAccess } from "@/lib/ai/auth"
import { aiRateLimit } from "@/lib/ai/rate-limit"
import { retrieveKnowledgeContext } from "@/lib/ai/knowledge"
import { runChatCompletion } from "@/lib/ai/llm"
import { logAiUsage } from "@/lib/ai/audit"
import type { AiIntent } from "@/lib/ai/types"

function parseIntent(raw: unknown): AiIntent {
  const v = String(raw || "").trim()
  if (v === "reporting" || v === "ops_recommend") return v
  return "qa"
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const access = await requireAiAccess(req)
  if (!access.ok) return access.response

  const rl = aiRateLimit(`ai:ask:${access.scoped.name}:${access.scoped.store}`, 50, 60 * 60 * 1000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterMs: rl.retryAfterMs },
      { status: 429, headers }
    )
  }

  let body: Record<string, unknown> = {}
  const startedAt = Date.now()
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers })
  }

  const query = String(body.query || "").trim()
  const intent = parseIntent(body.intent)
  const store = String(body.store || access.scoped.store || "All").trim()
  const dateRange = body.dateRange as { start?: string; end?: string } | undefined
  const start = String(dateRange?.start || "").trim().slice(0, 10)
  const end = String(dateRange?.end || "").trim().slice(0, 10)
  if (!query) return NextResponse.json({ error: "query is required" }, { status: 400, headers })

  const { chunks, citations } = await retrieveKnowledgeContext(query, access.scoped, 6)
  const contextBlock = chunks
    .map((c, idx) => `[${idx + 1}] ${c.title}\nsource=${c.source}, updatedAt=${c.updatedAt || "-"}\n${c.content.slice(0, 1200)}`)
    .join("\n\n")

  const intentGuide =
    intent === "reporting"
      ? "질문에 대해 수치 중심 리포트 형태로 답하고, 실행 가능한 액션 3개를 제시한다."
      : intent === "ops_recommend"
        ? "운영 최적화 제안 중심으로 답하고, 우선순위 높은 실행안 3개를 단계별로 제시한다."
        : "정확하고 간결하게 답하고, 필요한 경우 확인 질문 1~2개를 포함한다."

  const systemPrompt =
    "You are the ERP AI center assistant. " +
    "Respond in Korean. Never invent facts. " +
    "Respect role/store scope. " +
    "If evidence is insufficient, clearly say what is missing. " +
    "Always provide short actionable next steps."

  try {
    const llm = await runChatCompletion(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content:
            `의도: ${intent}\n지침: ${intentGuide}\n` +
            `사용자 스코프: role=${access.scoped.role}, store=${access.scoped.store}\n` +
            `요청 매장: ${store}\n` +
            `기간: ${start || "-"} ~ ${end || "-"} (Asia/Bangkok 기준)\n` +
            `질문: ${query}\n\n` +
            `참조 컨텍스트:\n${contextBlock || "(없음)"}`,
        },
      ],
      { temperature: 0.2, maxTokens: 1200 }
    )

    const answer =
      llm.text ||
      "현재 환경 변수에서 LLM 키가 설정되지 않아 규칙 기반으로만 안내합니다. AI 모델 응답을 사용하려면 OPENAI_API_KEY를 설정해 주세요."

    const plan = [
      "현재 답변 기반으로 1차 실행안을 선택",
      "실행 전 영향 범위(diff) 확인",
      "승인 후 실행대기함에서 반영",
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
      note: `intent=${intent}`,
    })

    return NextResponse.json(
      {
        answer,
        plan,
        citations,
        usage: llm.usage,
        model: llm.model,
      },
      { headers }
    )
  } catch (e) {
    console.error("ai/ask:", e)
    await logAiUsage({
      scoped: access.scoped,
      route: "/api/ai/ask",
      success: false,
      latencyMs: Date.now() - startedAt,
      note: e instanceof Error ? e.message : String(e),
    })
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}

