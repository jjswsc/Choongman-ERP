-- AI Center — pgvector RAG (Supabase SQL Editor에서 1회 실행)
-- 사전: OpenAI text-embedding-3-small (1536 dim) + scripts/ai-embed-knowledge-backfill.cjs

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.ai_knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(1536),
  ADD COLUMN IF NOT EXISTS embedding_model text,
  ADD COLUMN IF NOT EXISTS embedded_at timestamp without time zone;

CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_embedding_hnsw
  ON public.ai_knowledge_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 코사인 거리 검색 (1 - distance = similarity)
CREATE OR REPLACE FUNCTION public.search_ai_knowledge_chunks(
  query_embedding vector(1536),
  match_count integer DEFAULT 6,
  filter_store text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  source text,
  title text,
  content text,
  store_scope text,
  role_scope text,
  updated_at timestamp without time zone,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    c.id,
    c.source,
    c.title,
    c.content,
    c.store_scope,
    c.role_scope,
    c.updated_at,
    (1 - (c.embedding <=> query_embedding))::double precision AS similarity
  FROM public.ai_knowledge_chunks c
  WHERE c.embedding IS NOT NULL
    AND (
      filter_store IS NULL
      OR btrim(filter_store) = ''
      OR filter_store = 'All'
      OR c.store_scope IS NULL
      OR btrim(c.store_scope) = ''
      OR c.store_scope = 'All'
      OR c.store_scope = filter_store
    )
  ORDER BY c.embedding <=> query_embedding
  LIMIT GREATEST(1, LEAST(COALESCE(match_count, 6), 20));
$$;

COMMENT ON FUNCTION public.search_ai_knowledge_chunks IS
  'AI Center RAG — cosine similarity on ai_knowledge_chunks.embedding';

GRANT EXECUTE ON FUNCTION public.search_ai_knowledge_chunks(vector, integer, text) TO authenticated, service_role;
