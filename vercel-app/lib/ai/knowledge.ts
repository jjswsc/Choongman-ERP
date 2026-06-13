import { supabaseRpc, supabaseSelect } from "@/lib/supabase-server"
import { embedQuery, embeddingToPgVectorLiteral } from "@/lib/ai/embeddings"
import type { AiCitation, AiKnowledgeChunk, AiScopedAuth } from "@/lib/ai/types"
import { isOfficeRole } from "@/lib/permissions"

function tokenize(input: string): string[] {
  const raw = String(input || "").toLowerCase()
  const terms = raw
    .split(/[^a-z0-9\u0E00-\u0E7F가-힣]+/)
    .filter((x) => x.length >= 2)
  const uniq = [...new Set(terms)]
  const subs: string[] = []
  for (const t of uniq.slice(0, 8)) {
    if (t.length >= 4) subs.push(t.slice(0, Math.min(6, t.length)))
  }
  return [...uniq, ...subs].slice(0, 20)
}

function scoreChunk(chunk: AiKnowledgeChunk, terms: string[], queryNorm: string): number {
  const title = chunk.title.toLowerCase()
  const content = chunk.content.toLowerCase()
  let score = 0
  if (queryNorm.length >= 4 && title.includes(queryNorm)) score += 8
  for (const t of terms) {
    if (title.includes(t)) score += 3
    if (content.includes(t)) score += 1
    if (title.startsWith(t)) score += 2
  }
  if (chunk.updatedAt) {
    const ageMs = Date.now() - new Date(chunk.updatedAt).getTime()
    if (Number.isFinite(ageMs) && ageMs < 1000 * 60 * 60 * 24 * 90) score += 1
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
    if (
      roleScope === "manager" &&
      !(role.includes("manager") || role.includes("franchisee") || isOfficeRole(scoped.role))
    ) {
      return false
    }
  }
  return true
}

function rowToChunk(r: {
  id?: string | number
  source?: string
  title?: string
  content?: string
  store_scope?: string | null
  role_scope?: string | null
  updated_at?: string | null
}): AiKnowledgeChunk {
  return {
    id: String(r.id ?? ""),
    source: String(r.source || "internal"),
    title: String(r.title || "").slice(0, 200),
    content: String(r.content || ""),
    storeScope: r.store_scope ?? null,
    roleScope: r.role_scope ?? null,
    updatedAt: r.updated_at ?? null,
  }
}

async function retrieveKeywordChunks(
  query: string,
  scoped: AiScopedAuth,
  limit: number
): Promise<AiKnowledgeChunk[]> {
  const rows = (await supabaseSelect("ai_knowledge_chunks", {
    order: "updated_at.desc",
    limit: 500,
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

  const prepared = (rows || []).map(rowToChunk)
  const terms = tokenize(query)
  const queryNorm = String(query || "").toLowerCase().trim().slice(0, 80)

  return prepared
    .filter((c) => canReadChunk(c, scoped))
    .map((c) => ({ chunk: c, score: scoreChunk(c, terms, queryNorm) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.chunk)
}

async function retrieveVectorChunks(
  query: string,
  scoped: AiScopedAuth,
  limit: number
): Promise<AiKnowledgeChunk[]> {
  const embedding = await embedQuery(`${query}\n`.slice(0, 4000))
  if (!embedding?.length) return []

  const filterStore = isOfficeRole(scoped.role) ? "All" : scoped.store || "All"

  try {
    const rows = (await supabaseRpc<
      {
        id?: number
        source?: string
        title?: string
        content?: string
        store_scope?: string | null
        role_scope?: string | null
        updated_at?: string | null
        similarity?: number
      }[]
    >("search_ai_knowledge_chunks", {
      query_embedding: embeddingToPgVectorLiteral(embedding),
      match_count: Math.min(limit + 4, 20),
      filter_store: filterStore,
    })) as
      | {
          id?: number
          source?: string
          title?: string
          content?: string
          store_scope?: string | null
          role_scope?: string | null
          updated_at?: string | null
          similarity?: number
        }[]
      | null

    return (rows || [])
      .map((r) => rowToChunk(r))
      .filter((c) => canReadChunk(c, scoped))
      .slice(0, limit)
  } catch {
    return []
  }
}

function mergeChunks(vector: AiKnowledgeChunk[], keyword: AiKnowledgeChunk[], limit: number): AiKnowledgeChunk[] {
  const out: AiKnowledgeChunk[] = []
  const seen = new Set<string>()
  for (const c of [...vector, ...keyword]) {
    if (!c.id || seen.has(c.id)) continue
    seen.add(c.id)
    out.push(c)
    if (out.length >= limit) break
  }
  return out
}

export async function retrieveKnowledgeContext(
  query: string,
  scoped: AiScopedAuth,
  limit = 6
): Promise<{
  chunks: AiKnowledgeChunk[]
  citations: AiCitation[]
}> {
  const [vector, keyword] = await Promise.all([
    retrieveVectorChunks(query, scoped, limit),
    retrieveKeywordChunks(query, scoped, limit),
  ])
  const ranked = mergeChunks(vector, keyword, limit)

  const citations: AiCitation[] = ranked.map((c) => ({
    id: c.id,
    source: c.source,
    title: c.title,
    snippet: c.content.slice(0, 220),
    updatedAt: c.updatedAt,
  }))

  return { chunks: ranked, citations }
}
