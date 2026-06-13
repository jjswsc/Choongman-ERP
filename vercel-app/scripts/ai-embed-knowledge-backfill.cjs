#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * ai_knowledge_chunks embedding 백필 — sql/ai_knowledge_vector.sql 적용 후 실행
 *
 *   OPENAI_API_KEY=... SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/ai-embed-knowledge-backfill.cjs [--limit 200] [--batch 16]
 */
const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim()
const SUPABASE_SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim()
const OPENAI_API_KEY = (process.env.OPENAI_API_KEY || "").trim()
const EMBED_MODEL = (process.env.OPENAI_ERP_EMBEDDING_MODEL || "text-embedding-3-small").trim()

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENAI_API_KEY) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY required")
  process.exit(1)
}

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`)
  if (i < 0) return fallback
  return process.argv[i + 1] || fallback
}

const limit = Math.max(1, Math.min(Number(arg("limit", "200")), 5000))
const batchSize = Math.max(1, Math.min(Number(arg("batch", "16")), 32))
const base = SUPABASE_URL.replace(/\/$/, "")

async function fetchMissing(limitN) {
  const q = new URLSearchParams({
    select: "id,title,content,source",
    embedding: "is.null",
    order: "updated_at.desc",
    limit: String(limitN),
  })
  const res = await fetch(`${base}/rest/v1/ai_knowledge_chunks?${q}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function embedBatch(texts) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`embed ${res.status}: ${text.slice(0, 200)}`)
  const json = JSON.parse(text)
  return (json.data || [])
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding)
}

async function patchEmbedding(id, embedding) {
  const literal = `[${embedding.join(",")}]`
  const res = await fetch(`${base}/rest/v1/ai_knowledge_chunks?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      embedding: literal,
      embedding_model: EMBED_MODEL,
      embedded_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    }),
  })
  if (!res.ok) throw new Error(`patch ${id}: ${(await res.text()).slice(0, 200)}`)
}

async function main() {
  const rows = await fetchMissing(limit)
  if (!rows.length) {
    console.log("No chunks without embedding.")
    return
  }
  console.log(`Backfilling ${rows.length} chunks (batch=${batchSize})`)
  let done = 0
  for (let i = 0; i < rows.length; i += batchSize) {
    const slice = rows.slice(i, i + batchSize)
    const texts = slice.map((r) => `${r.title || ""}\n${r.content || ""}`.slice(0, 8000))
    const vectors = await embedBatch(texts)
    for (let j = 0; j < slice.length; j += 1) {
      await patchEmbedding(slice[j].id, vectors[j])
      done += 1
    }
    console.log(`  ${done}/${rows.length}`)
  }
  console.log("Done.")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
