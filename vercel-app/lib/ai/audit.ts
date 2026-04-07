import { getBangkokDateTimeString } from "@/lib/bangkok-time"
import { supabaseInsert } from "@/lib/supabase-server"
import type { AiScopedAuth } from "@/lib/ai/types"

export async function logAiUsage(input: {
  scoped: AiScopedAuth
  route: string
  model?: string | null
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  success: boolean
  latencyMs?: number
  note?: string
}) {
  try {
    await supabaseInsert("ai_usage_logs", {
      route: input.route.slice(0, 120),
      model: (input.model || "").slice(0, 120) || null,
      prompt_tokens: Math.max(0, Math.floor(input.promptTokens || 0)),
      completion_tokens: Math.max(0, Math.floor(input.completionTokens || 0)),
      total_tokens: Math.max(0, Math.floor(input.totalTokens || 0)),
      success: input.success,
      latency_ms: input.latencyMs == null ? null : Math.max(0, Math.floor(input.latencyMs)),
      note: input.note == null ? null : String(input.note).slice(0, 1000),
      user_name: input.scoped.name.slice(0, 120),
      user_role: input.scoped.role.slice(0, 120),
      user_store: (input.scoped.store || "All").slice(0, 120),
      created_at: getBangkokDateTimeString(),
    })
  } catch (e) {
    console.warn("logAiUsage failed:", e)
  }
}

