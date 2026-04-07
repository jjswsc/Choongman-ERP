import { supabaseSelect } from "@/lib/supabase-server"
import type { AiCitation, AiKnowledgeChunk, AiScopedAuth } from "@/lib/ai/types"
import { isOfficeRole } from "@/lib/permissions"

function tokenize(input: string): string[] {
  return String(input || "")
    .toLowerCase()
    .split(/[^a-z0-9가-힣]+/)
    .filter((x) => x.length >= 2)
    .slice(0, 16)
}

function scoreChunk(chunk: AiKnowledgeChunk, terms: string[]): number {
  const title = chunk.title.toLowerCase()
  const content = chunk.content.toLowerCase()
  let score = 0
  for (const t of terms) {
    if (title.includes(t)) score += 3
    if (content.includes(t)) score += 1
  }
  return score
}

function canReadChunk(chunk: AiKnowledgeChunk, scoped: AiScopedAuth): boolean {
  const storeScope = (chunk.storeScope || "").trim()
  const roleScope = (chunk.roleScope || "").trim().toLowerCase()
  const role = scoped.role.toLowerCase()

  if (storeScope && storeScope !== "All") {
    if (storeScope !== scoped.store && !isOfficeRole(scoped.role)) return false
  }
  if (roleScope) {
    if (roleScope === "office" && !isOfficeRole(scoped.role)) return false
    if (roleScope === "manager" && !(role.includes("manager") || role.includes("franchisee") || isOfficeRole(scoped.role))) return false
  }
  return true
}

export async function retrieveKnowledgeContext(query: string, scoped: AiScopedAuth, limit = 6): Promise<{
  chunks: AiKnowledgeChunk[]
  citations: AiCitation[]
}> {
  const rows = (await supabaseSelect("ai_knowledge_chunks", {
    order: "updated_at.desc",
    limit: 300,
    select: "id,source,title,content,store_scope,role_scope,updated_at",
  })) as
    | {
        id?: string | number
        source?: string
        title?: string
        content?: string
        store_scope?: string | null
        role_scope?: string | null
        updated_at?: string | null
      }[]
    | null

  const prepared: AiKnowledgeChunk[] = (rows || []).map((r) => ({
    id: String(r.id ?? ""),
    source: String(r.source || "internal"),
    title: String(r.title || "").slice(0, 200),
    content: String(r.content || ""),
    storeScope: r.store_scope ?? null,
    roleScope: r.role_scope ?? null,
    updatedAt: r.updated_at ?? null,
  }))

  const terms = tokenize(query)
  const ranked = prepared
    .filter((c) => canReadChunk(c, scoped))
    .map((c) => ({ chunk: c, score: scoreChunk(c, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.chunk)

  const citations: AiCitation[] = ranked.map((c) => ({
    id: c.id,
    source: c.source,
    title: c.title,
    snippet: c.content.slice(0, 220),
    updatedAt: c.updatedAt,
  }))

  return { chunks: ranked, citations }
}

