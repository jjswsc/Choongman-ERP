/**
 * 사용자 입력 텍스트 번역 API (내용/memo 등)
 * POST body: { texts: string[], targetLang: string } → { translated: string[] }
 * targetLang: ko, en, th, mm, la (mm→my, la→lo 변환)
 * 원문 언어 자동 감지 (sl=auto). ko(한국어 UI)도 태·영 등 원문을 번역해 표시한다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'

const LANG_MAP: Record<string, string> = { ko: 'ko', en: 'en', th: 'th', mm: 'my', la: 'lo', kh: 'km', vi: 'vi', ms: 'ms' }
const UA = 'Mozilla/5.0 (compatible; ChoongmanERP/1.0)'
/** Google gtx 부하 완화용 동시 호출 수 */
const CONCURRENCY = 5
const CACHE_MAX = 800

/** 프로세스 수명 동안 유지 (동일 원문 재번역 생략) */
const translateCache = new Map<string, string>()

function cacheGet(key: string): string | undefined {
  const hit = translateCache.get(key)
  if (hit === undefined) return undefined
  // LRU: 재삽입으로 최근 사용 표시
  translateCache.delete(key)
  translateCache.set(key, hit)
  return hit
}

function cacheSet(key: string, value: string) {
  if (translateCache.has(key)) translateCache.delete(key)
  translateCache.set(key, value)
  while (translateCache.size > CACHE_MAX) {
    const oldest = translateCache.keys().next().value
    if (oldest === undefined) break
    translateCache.delete(oldest)
  }
}

async function translateOne(text: string, targetLang: string): Promise<string> {
  const trimmed = String(text || '').trim()
  if (!trimmed) return ''
  const tl = LANG_MAP[targetLang] || targetLang || 'en'
  const cacheKey = `${tl}\0${trimmed}`
  const cached = cacheGet(cacheKey)
  if (cached !== undefined) return cached
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(trimmed.slice(0, 5000))}`
    const resp = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!resp.ok) {
      console.warn('translate google status:', resp.status)
      return trimmed
    }
    const data = (await resp.json()) as unknown
    if (Array.isArray(data) && Array.isArray((data as unknown[])[0])) {
      const first = (data as unknown[])[0] as Array<[string | null]>
      const result = first.map((x) => x[0]).filter(Boolean).join('')
      if (result && result.trim()) {
        cacheSet(cacheKey, result)
        return result
      }
    }
  } catch (e) {
    console.warn('translate google:', e)
  }
  return trimmed
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= items.length) return
      results[i] = await fn(items[i]!, i)
    }
  }
  const n = Math.min(Math.max(1, concurrency), Math.max(1, items.length))
  await Promise.all(Array.from({ length: n }, () => worker()))
  return results
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    const res = authResult.errorResponse
    res.headers.set('Access-Control-Allow-Origin', '*')
    return res
  }
  let body: { texts?: unknown[]; text?: unknown; targetLang?: string } = {}
  try {
    body = (await request.json().catch(() => ({}))) as typeof body
    const targetLang = String(body.targetLang || 'ko').toLowerCase().slice(0, 2)
    const texts = Array.isArray(body.texts) ? body.texts : [body.text]

    if (!texts.length) {
      return NextResponse.json({ translated: [] }, { headers })
    }

    const sources = texts.map((t) => String(t ?? '').trim())
    const results = await mapPool(sources, CONCURRENCY, async (src) => {
      const t = await translateOne(src, targetLang)
      return (t && t.trim()) || src
    })
    return NextResponse.json({ translated: results }, { headers })
  } catch (e) {
    console.error('translate:', e)
    const texts = Array.isArray(body?.texts) ? body.texts : []
    return NextResponse.json({ translated: texts.map((s: unknown) => String(s ?? '').trim()) }, { headers })
  }
}
