import { supabaseSelect, supabaseRpc } from "@/lib/supabase-server"
import { embedQuery, embeddingToPgVectorLiteral } from "@/lib/ai/embeddings"

export const AI_CENTER_TABLES = [
  "ai_knowledge_chunks",
  "ai_action_requests",
  "ai_action_events",
  "ai_notice_drafts",
  "ai_followup_tasks",
  "ai_usage_logs",
  "external_store_profiles",
  "external_context_daily",
] as const

export type AiCenterTableName = (typeof AI_CENTER_TABLES)[number]

function isMissingTableError(e: unknown): boolean {
  const msg = String(e instanceof Error ? e.message : e).toLowerCase()
  return msg.includes("42p01") || /relation .* does not exist/.test(msg)
}

export async function probeAiCenterTable(table: AiCenterTableName): Promise<{ ok: boolean; error?: string }> {
  try {
    await supabaseSelect(table, { limit: 1, select: "id" })
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error: isMissingTableError(e) ? "table_missing_or_inaccessible" : message.slice(0, 200),
    }
  }
}

export async function getAiCenterFoundationHealth(): Promise<{
  tables: Record<AiCenterTableName, { ok: boolean; error?: string }>
  allTablesOk: boolean
  openaiConfigured: boolean
  vectorSearchReady: boolean
  step: 0
  readyForStep1: boolean
}> {
  const entries = await Promise.all(
    AI_CENTER_TABLES.map(async (table) => [table, await probeAiCenterTable(table)] as const)
  )
  const tables = Object.fromEntries(entries) as Record<AiCenterTableName, { ok: boolean; error?: string }>
  const allTablesOk = AI_CENTER_TABLES.every((t) => tables[t].ok)
  const openaiConfigured = Boolean(process.env.OPENAI_API_KEY?.trim())

  return {
    tables,
    allTablesOk,
    openaiConfigured,
    vectorSearchReady: await probeVectorSearch(),
    step: 0,
    readyForStep1: allTablesOk && openaiConfigured,
  }
}

async function probeVectorSearch(): Promise<boolean> {
  if (!process.env.OPENAI_API_KEY?.trim()) return false
  try {
    const emb = await embedQuery("health check")
    if (!emb?.length) return false
    await supabaseRpc("search_ai_knowledge_chunks", {
      query_embedding: embeddingToPgVectorLiteral(emb),
      match_count: 1,
      filter_store: "All",
    })
    return true
  } catch {
    return false
  }
}
