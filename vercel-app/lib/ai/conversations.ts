import "server-only"

import { getBangkokDateTimeString } from "@/lib/bangkok-time"
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from "@/lib/supabase-server"
import type { AiScopedAuth } from "@/lib/ai/types"

export type AiConversationRow = {
  id: number
  title: string
  lastIntent: string | null
  createdAt: string
  updatedAt: string
}

export type AiConversationMessageRow = {
  id: number
  role: "user" | "assistant"
  content: string
  intent: string | null
  createdAt: string
}

export async function listAiConversations(scoped: AiScopedAuth, limit = 20): Promise<AiConversationRow[]> {
  const filters = [
    `user_name=eq.${encodeURIComponent(scoped.name)}`,
    `user_store=eq.${encodeURIComponent(scoped.store || "All")}`,
    "order=updated_at.desc",
    `limit=${Math.max(1, Math.min(limit, 50))}`,
  ]
  const rows = await supabaseSelectFilter("ai_conversations", filters.join("&"), {
    select: "id,title,last_intent,created_at,updated_at",
  }).catch(() => [])
  return ((rows as Record<string, unknown>[]) || []).map((r) => ({
    id: Number(r.id || 0),
    title: String(r.title || ""),
    lastIntent: r.last_intent == null ? null : String(r.last_intent),
    createdAt: String(r.created_at || ""),
    updatedAt: String(r.updated_at || ""),
  }))
}

export async function getAiConversationMessages(
  scoped: AiScopedAuth,
  conversationId: number
): Promise<{ conversation: AiConversationRow | null; messages: AiConversationMessageRow[] }> {
  const convRows = await supabaseSelectFilter(
    "ai_conversations",
    `id=eq.${conversationId}&user_name=eq.${encodeURIComponent(scoped.name)}&user_store=eq.${encodeURIComponent(scoped.store || "All")}`,
    { limit: 1, select: "id,title,last_intent,created_at,updated_at" }
  ).catch(() => [])
  const conv = (convRows as Record<string, unknown>[])?.[0]
  if (!conv) return { conversation: null, messages: [] }

  const msgRows = await supabaseSelectFilter(
    "ai_conversation_messages",
    `conversation_id=eq.${conversationId}&order=id.asc&limit=100`,
    { select: "id,role,content,intent,created_at" }
  ).catch(() => [])

  return {
    conversation: {
      id: Number(conv.id || 0),
      title: String(conv.title || ""),
      lastIntent: conv.last_intent == null ? null : String(conv.last_intent),
      createdAt: String(conv.created_at || ""),
      updatedAt: String(conv.updated_at || ""),
    },
    messages: ((msgRows as Record<string, unknown>[]) || []).map((m) => ({
      id: Number(m.id || 0),
      role: String(m.role || "user") === "assistant" ? "assistant" : "user",
      content: String(m.content || ""),
      intent: m.intent == null ? null : String(m.intent),
      createdAt: String(m.created_at || ""),
    })),
  }
}

export async function saveAiConversationTurn(input: {
  scoped: AiScopedAuth
  conversationId?: number
  query: string
  answer: string
  intent: string
  meta?: Record<string, unknown>
}): Promise<{ conversationId: number }> {
  const now = getBangkokDateTimeString()
  let convId = Number(input.conversationId || 0)

  if (!convId) {
    const title = input.query.trim().slice(0, 80) || "AI 질의"
    const inserted = await supabaseInsert("ai_conversations", {
      user_name: input.scoped.name,
      user_role: input.scoped.role,
      user_store: input.scoped.store || "All",
      title,
      last_intent: input.intent,
      created_at: now,
      updated_at: now,
    })
    convId = Number((inserted as { id?: number }[])?.[0]?.id || 0)
  } else {
    await supabaseUpdateByFilter("ai_conversations", `id=eq.${convId}`, {
      updated_at: now,
      last_intent: input.intent,
    })
  }

  if (!convId) throw new Error("conversation insert failed")

  await supabaseInsert("ai_conversation_messages", {
    conversation_id: convId,
    role: "user",
    content: input.query,
    intent: input.intent,
    meta_json: {},
    created_at: now,
  })
  await supabaseInsert("ai_conversation_messages", {
    conversation_id: convId,
    role: "assistant",
    content: input.answer,
    intent: input.intent,
    meta_json: input.meta || {},
    created_at: now,
  })

  return { conversationId: convId }
}
