import { NextRequest } from "next/server"
import { requireAiAccess } from "@/lib/ai/auth"
import { aiRateLimit } from "@/lib/ai/rate-limit"
import { retrieveKnowledgeContext } from "@/lib/ai/knowledge"
import { streamChatCompletionDeltas } from "@/lib/ai/llm"
import { logAiUsage } from "@/lib/ai/audit"
import { getExternalContextSummary } from "@/lib/ai/external-context"
import { buildStaffingInsight, isStaffingQuestion } from "@/lib/ai/staffing-advisor"
import { buildStoreOpsInsight, isStoreOpsQuestion } from "@/lib/ai/store-ops-advisor"
import { applyAiDateRangePolicy, buildAiDataPolicy } from "@/lib/ai/policy"
import { buildAiSystemPrompt } from "@/lib/ai/llm-locale"
import type { AiIntent } from "@/lib/ai/types"

function parseIntent(raw: unknown): AiIntent {
  const v = String(raw || "").trim()
  if (v === "reporting" || v === "ops_recommend") return v
  return "qa"
}

export async function POST(req: NextRequest) {
  const access = await requireAiAccess(req)
  if (!access.ok) return access.response

  const rl = aiRateLimit(`ai:ask:${access.scoped.name}:${access.scoped.store}`, 50, 60 * 60 * 1000)
  if (!rl.ok) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded", code: "AI_RATE_LIMITED" }), { status: 429 })
  }

  let body: Record<string, unknown> = {}
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 })
  }

  const query = String(body.query || "").trim()
  const intent = parseIntent(body.intent)
  const lang = String(body.lang || "ko")
  const requestedStore = String(body.store || access.scoped.store || "All").trim()
  const dateRange = body.dateRange as { start?: string; end?: string } | undefined
  const requestedStart = String(dateRange?.start || "").trim().slice(0, 10)
  const requestedEnd = String(dateRange?.end || "").trim().slice(0, 10)
  const policy = buildAiDataPolicy({ scoped: access.scoped, intent, requestedStore })
  const store = policy.resolvedStore
  const ranged = applyAiDateRangePolicy({
    start: requestedStart,
    end: requestedEnd,
    maxDays: policy.maxDateRangeDays,
  })
  const start = ranged.start || ""
  const end = ranged.end || ""
  if (!query) {
    return new Response(JSON.stringify({ error: "query is required" }), { status: 400 })
  }

  const startedAt = Date.now()
  const [{ chunks, citations }, staffing, storeOps, external] = await Promise.all([
    retrieveKnowledgeContext(query, access.scoped, 6),
    isStaffingQuestion(query)
      ? buildStaffingInsight({ scoped: access.scoped, requestedStore: store })
      : Promise.resolve(null),
    isStoreOpsQuestion(query)
      ? buildStoreOpsInsight({ scoped: access.scoped, requestedStore: store, start, end })
      : Promise.resolve(null),
    getExternalContextSummary({
      scoped: access.scoped,
      store,
      start: start || undefined,
      end: end || undefined,
      limit: 21,
    }),
  ])

  const contextBlock = chunks
    .map((c, idx) => `[${idx + 1}] ${c.title}\nsource=${c.source}\n${c.content.slice(0, 1200)}`)
    .join("\n\n")
  const staffingBlock = staffing?.hasData
    ? `인력: ${staffing.summary}\n${(staffing.lines || []).map((l) => `- ${l}`).join("\n")}`
    : ""
  const storeOpsBlock = storeOps?.hasData
    ? `매출·매입: ${storeOps.summary}\n${(storeOps.lines || []).map((l) => `- ${l}`).join("\n")}`
    : ""

  const systemPrompt = buildAiSystemPrompt(lang)

  const userContent =
    `의도: ${intent}\n매장: ${store}\n기간: ${start || "-"} ~ ${end || "-"}\n` +
    `외부환경: ${external.summaryText}\n${staffingBlock ? `${staffingBlock}\n` : ""}` +
    `${storeOpsBlock ? `${storeOpsBlock}\n` : ""}` +
    `질문: ${query}\n\n참조:\n${contextBlock || "(없음)"}`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
      }
      send({
        type: "meta",
        citations,
        externalSummary: external.summaryText,
        storeOpsMetrics: storeOps?.metrics ?? null,
        storeBreakdown: storeOps?.storeBreakdown ?? null,
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
      })

      let model: string | null = null
      let usage = null as { promptTokens: number; completionTokens: number; totalTokens: number } | null
      try {
        for await (const chunk of streamChatCompletionDeltas(
          [
            { role: "system", content: systemPrompt },
            { role: "user", content: userContent },
          ],
          { temperature: 0.2, maxTokens: 1200 }
        )) {
          if (chunk.type === "delta") send({ type: "delta", text: chunk.text })
          else {
            model = chunk.model
            usage = chunk.usage
          }
        }
        send({ type: "done", model, usage })
        await logAiUsage({
          scoped: access.scoped,
          route: "/api/ai/ask/stream",
          model,
          promptTokens: usage?.promptTokens,
          completionTokens: usage?.completionTokens,
          totalTokens: usage?.totalTokens,
          success: true,
          latencyMs: Date.now() - startedAt,
          note: `intent=${intent},stream=1`,
        })
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) })
        await logAiUsage({
          scoped: access.scoped,
          route: "/api/ai/ask/stream",
          success: false,
          latencyMs: Date.now() - startedAt,
          note: e instanceof Error ? e.message : String(e),
        })
      } finally {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"))
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  })
}
