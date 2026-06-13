import 'server-only'

export const AI_EMBEDDING_MODEL =
  process.env.OPENAI_ERP_EMBEDDING_MODEL?.trim() || 'text-embedding-3-small'

export const AI_EMBEDDING_DIM = 1536

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  const inputs = texts.map((t) => String(t || '').trim().slice(0, 8000)).filter(Boolean)
  if (!inputs.length) return null

  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: AI_EMBEDDING_MODEL,
      input: inputs,
    }),
  })
  const bodyText = await res.text()
  if (!res.ok) {
    throw new Error(`OpenAI embeddings failed (${res.status}): ${bodyText.slice(0, 300)}`)
  }
  const json = JSON.parse(bodyText) as {
    data?: { embedding?: number[]; index?: number }[]
  }
  const sorted = (json.data || []).slice().sort((a, b) => Number(a.index) - Number(b.index))
  return sorted.map((d) => d.embedding || []).filter((v) => v.length > 0)
}

export async function embedQuery(text: string): Promise<number[] | null> {
  const batch = await embedTexts([text])
  return batch?.[0] ?? null
}

/** PostgREST RPC vector 파라미터용 문자열 `[0.1,0.2,...]` */
export function embeddingToPgVectorLiteral(values: number[]): string {
  return `[${values.map((v) => (Number.isFinite(v) ? v : 0)).join(',')}]`
}
