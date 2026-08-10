/**
 * 사용자 입력 텍스트 번역 API (내용/memo 등)
 * POST body: { texts: string[], targetLang: string } → { translated: string[] }
 * targetLang: ko, en, th, mm, la (mm→my, la→lo 변환)
 * 원문 언어 자동 감지 (sl=auto). ko(한국어 UI)도 태·영 등 원문을 번역해 표시한다.
 *
 * Google gtx가 데이터센터 IP에서 원문을 그대로 돌려줄 수 있어 MyMemory 폴백을 둔다.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'

const LANG_MAP: Record<string, string> = {
  ko: 'ko',
  en: 'en',
  th: 'th',
  mm: 'my',
  la: 'lo',
  kh: 'km',
  vi: 'vi',
  ms: 'ms',
}
/** MyMemory langpair 용 (Google tl 코드와 다를 수 있음) */
const MYMEMORY_LANG: Record<string, string> = {
  ko: 'ko',
  en: 'en',
  th: 'th',
  my: 'my',
  lo: 'lo',
  km: 'km',
  vi: 'vi',
  ms: 'ms',
}
const UA = 'Mozilla/5.0 (compatible; ChoongmanERP/1.0)'
const CONCURRENCY = 4
const CACHE_MAX = 800
const GOOGLE_CHUNK = 4500
const MYMEMORY_CHUNK = 450

const translateCache = new Map<string, string>()

function cacheGet(key: string): string | undefined {
  const hit = translateCache.get(key)
  if (hit === undefined) return undefined
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

function hasThai(s: string) {
  return /[\u0E00-\u0E7F]/.test(s)
}
function hasHangul(s: string) {
  return /[가-힣]/.test(s)
}
function hasLatinLetters(s: string) {
  return /[A-Za-z]/.test(s)
}
function hasMyanmar(s: string) {
  return /[\u1000-\u109F]/.test(s)
}
function hasLao(s: string) {
  return /[\u0E80-\u0EFF]/.test(s)
}
function hasKhmer(s: string) {
  return /[\u1780-\u17FF]/.test(s)
}

/** 원문이 이미 목표 언어처럼 보이면 번역 불필요 */
function alreadyTargetLang(text: string, tl: string): boolean {
  if (tl === 'ko') return hasHangul(text) && !hasThai(text) && !hasMyanmar(text) && !hasLao(text) && !hasKhmer(text)
  if (tl === 'th') return hasThai(text)
  if (tl === 'en') return hasLatinLetters(text) && !hasHangul(text) && !hasThai(text)
  if (tl === 'my') return hasMyanmar(text)
  if (tl === 'lo') return hasLao(text)
  if (tl === 'km') return hasKhmer(text)
  if (tl === 'vi' || tl === 'ms') return hasLatinLetters(text) && !hasHangul(text) && !hasThai(text)
  return false
}

/** 번역 결과가 실패(원문 유지)인지 — 목표 언어 글자가 없고 이질 스크립트가 남은 경우 */
function translationLooksFailed(src: string, out: string, tl: string): boolean {
  const a = src.trim()
  const b = out.trim()
  if (!b) return true
  if (alreadyTargetLang(a, tl)) return false
  if (b !== a) {
    // 바뀌었더라도 목표 언어 신호가 전혀 없고 태국어 등이 그대로면 실패로 본다
    if (tl === 'ko' && !hasHangul(b) && (hasThai(b) || hasMyanmar(b) || hasLao(b) || hasKhmer(b))) return true
    return false
  }
  // 원문과 동일 — 태·미얀마·라오·크메르 등 이질 스크립트가 있으면 실패
  if (tl === 'ko') return hasThai(a) || hasMyanmar(a) || hasLao(a) || hasKhmer(a)
  if (tl === 'th') return hasHangul(a)
  if (tl === 'en') return hasHangul(a) || hasThai(a)
  return hasHangul(a) || hasThai(a)
}

function chunkText(text: string, size: number): string[] {
  if (text.length <= size) return [text]
  const parts: string[] = []
  let i = 0
  while (i < text.length) {
    parts.push(text.slice(i, i + size))
    i += size
  }
  return parts
}

async function translateGoogleChunk(text: string, tl: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`
    const resp = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!resp.ok) {
      console.warn('translate google status:', resp.status)
      return null
    }
    const data = (await resp.json()) as unknown
    if (Array.isArray(data) && Array.isArray((data as unknown[])[0])) {
      const first = (data as unknown[])[0] as Array<[string | null]>
      const result = first.map((x) => x[0]).filter(Boolean).join('')
      if (result && result.trim()) return result.trim()
    }
  } catch (e) {
    console.warn('translate google:', e)
  }
  return null
}

async function translateMyMemoryChunk(text: string, tl: string): Promise<string | null> {
  const pairTl = MYMEMORY_LANG[tl] || tl || 'en'
  try {
    // langpair=auto|xx 는 미지원인 경우가 많아 태→목표를 우선 시도 후 en→목표
    const pairs = [`th|${pairTl}`, `auto|${pairTl}`, `en|${pairTl}`]
    for (const pair of pairs) {
      const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`
      const resp = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!resp.ok) continue
      const data = (await resp.json()) as {
        responseStatus?: number
        responseData?: { translatedText?: string }
      }
      const out = String(data?.responseData?.translatedText || '').trim()
      if (!out) continue
      // 쿼터/에러 문구 스킵
      if (/^MYMEMORY WARNING/i.test(out) || /^QUERY LENGTH LIMIT/i.test(out)) continue
      if (Number(data?.responseStatus) === 200 || out !== text) return out
    }
  } catch (e) {
    console.warn('translate mymemory:', e)
  }
  return null
}

async function translateViaProvider(
  text: string,
  tl: string,
  provider: 'google' | 'mymemory'
): Promise<string | null> {
  const size = provider === 'google' ? GOOGLE_CHUNK : MYMEMORY_CHUNK
  const chunks = chunkText(text, size)
  const outs: string[] = []
  for (const chunk of chunks) {
    const part =
      provider === 'google' ? await translateGoogleChunk(chunk, tl) : await translateMyMemoryChunk(chunk, tl)
    if (part == null) return null
    outs.push(part)
  }
  return outs.join('')
}

async function translateOne(text: string, targetLang: string): Promise<string> {
  const trimmed = String(text || '').trim()
  if (!trimmed) return ''
  const tl = LANG_MAP[targetLang] || targetLang || 'en'
  if (alreadyTargetLang(trimmed, tl)) return trimmed

  const cacheKey = `${tl}\0${trimmed}`
  const cached = cacheGet(cacheKey)
  if (cached !== undefined) return cached

  let out = await translateViaProvider(trimmed, tl, 'google')
  if (out == null || translationLooksFailed(trimmed, out, tl)) {
    const fb = await translateViaProvider(trimmed, tl, 'mymemory')
    if (fb != null && !translationLooksFailed(trimmed, fb, tl)) {
      out = fb
    } else if (out == null) {
      out = fb
    }
  }

  const finalOut = (out && out.trim()) || trimmed
  // 실패(원문 유지)는 캐시하지 않아 다음 요청에서 재시도
  if (!translationLooksFailed(trimmed, finalOut, tl)) {
    cacheSet(cacheKey, finalOut)
  } else {
    console.warn('translate failed to change script', { tl, sample: trimmed.slice(0, 40) })
  }
  return finalOut
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
