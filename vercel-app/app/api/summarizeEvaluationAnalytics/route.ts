import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import {
  loadEvaluationAnalytics,
  canSummarizeEvalAnalyticsRole,
} from '@/lib/evaluation-analytics-load'

const rateBucket = new Map<string, { n: number; reset: number }>()
const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_WINDOW = 20

function buildSlimPayloadForLlm(input: Record<string, unknown>) {
  const byEv = Array.isArray(input.byEvaluator)
    ? (input.byEvaluator as { evaluator?: string; evaluations?: number; avgScore?: number | null }[])
        .slice(0, 8)
        .map((e) => ({
          label: String(e.evaluator || '').replace(/\s+/g, ' ').slice(0, 40),
          evaluations: e.evaluations ?? 0,
          avgScore: e.avgScore ?? null,
        }))
    : []
  return {
    summary: input.summary,
    gradeDistribution: input.gradeDistribution,
    byStore: input.byStore,
    byType: input.byType,
    byMonth: input.byMonth,
    byEvaluatorSample: byEv,
    sectionAverages: input.sectionAverages,
    source: input.source,
  }
}

/**
 * 직원 평가 집계 요약 (OpenAI). 본사·회계만. OPENAI_API_KEY 필요.
 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const auth = await getVerifiedAuth(req)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
  }
  const role = String(auth.role || '')
  if (!canSummarizeEvalAnalyticsRole(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403, headers })
  }

  const now = Date.now()
  const rateKey = `${auth.name}|${auth.store}|eval-ai`
  let b = rateBucket.get(rateKey)
  if (!b || now > b.reset) {
    b = { n: 0, reset: now + WINDOW_MS }
    rateBucket.set(rateKey, b)
  }
  if (b.n >= MAX_PER_WINDOW) {
    return NextResponse.json({ error: 'Rate limit' }, { status: 429, headers })
  }

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers })
  }

  const start = String(body.start || '').trim().slice(0, 10)
  const end = String(body.end || '').trim().slice(0, 10)
  const type = String(body.type || 'all').trim()
  const storeQuery = String(body.store || 'All').trim()

  if (!start || !end || start.length < 10 || end.length < 10) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400, headers })
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json(
      { error: 'OPENAI_API_KEY is not configured' },
      { status: 503, headers }
    )
  }

  try {
    const payload = await loadEvaluationAnalytics(auth, { start, end, type, storeQuery })
    const slim = buildSlimPayloadForLlm(payload as unknown as Record<string, unknown>)

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_EVAL_ANALYTICS_MODEL?.trim() || 'gpt-4o-mini',
        temperature: 0.35,
        max_tokens: 900,
        messages: [
          {
            role: 'system',
            content:
              'You are an HR analytics assistant. Summarize the given employee evaluation statistics for leadership. ' +
              'Write in Korean. Use bullet points where helpful. Focus on trends, store comparison, grade mix, and training implications. ' +
              'Do not invent numbers. If data is sparse, say so.',
          },
          {
            role: 'user',
            content:
              `기간: ${start} ~ ${end}, 유형: ${type}, 매장필터: ${storeQuery}\nJSON:\n` +
              JSON.stringify(slim),
          },
        ],
      }),
    })

    const text = await res.text()
    if (!res.ok) {
      console.error('summarizeEvaluationAnalytics OpenAI:', res.status, text.slice(0, 500))
      return NextResponse.json(
        { error: 'OpenAI request failed', detail: text.slice(0, 200) },
        { status: 502, headers }
      )
    }

    const parsed = JSON.parse(text) as {
      choices?: { message?: { content?: string } }[]
    }
    const content = parsed.choices?.[0]?.message?.content?.trim() || ''
    b.n += 1
    return NextResponse.json({ summary: content, source: payload.source }, { headers })
  } catch (e) {
    console.error('summarizeEvaluationAnalytics:', e)
    return NextResponse.json({ error: String(e) }, { status: 500, headers })
  }
}
