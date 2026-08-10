/**
 * 사용자 입력 텍스트 번역 API (내용/memo 등)
 * POST body: { texts: string[], targetLang: string, quality?: 'high'|'fast' }
 *   → { translated: string[] }
 * targetLang: ko, en, th, mm, la, kh, vi, ms (mm→my, la→lo, kh→km)
 *
 * quality=high (공지 등): OpenAI(있으면) → Google → MyMemory
 * quality=fast (기본): Google → MyMemory
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
const LANG_NAME: Record<string, string> = {
  ko: 'Korean',
  en: 'English',
  th: 'Thai',
  my: 'Burmese (Myanmar)',
  lo: 'Lao',
  km: 'Khmer',
  vi: 'Vietnamese',
  ms: 'Malay',
}
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
const OPENAI_BATCH_MAX = 24

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

function translationLooksFailed(src: string, out: string, tl: string): boolean {
  const a = src.trim()
  const b = out.trim()
  if (!b) return true
  if (alreadyTargetLang(a, tl)) return false
  if (b !== a) {
    if (tl === 'ko' && !hasHangul(b) && (hasThai(b) || hasMyanmar(b) || hasLao(b) || hasKhmer(b))) return true
    if (tl === 'my' && !hasMyanmar(b) && (hasThai(b) || hasHangul(b))) return true
    if (tl === 'th' && !hasThai(b) && (hasHangul(b) || hasMyanmar(b))) return true
    return false
  }
  if (tl === 'ko') return hasThai(a) || hasMyanmar(a) || hasLao(a) || hasKhmer(a)
  if (tl === 'my') return hasThai(a) || hasHangul(a) || hasLao(a) || hasKhmer(a)
  if (tl === 'th') return hasHangul(a) || hasMyanmar(a)
  if (tl === 'en') return hasHangul(a) || hasThai(a) || hasMyanmar(a)
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

function detectMyMemorySourceLang(text: string): string {
  if (hasThai(text)) return 'th'
  if (hasHangul(text)) return 'ko'
  if (hasMyanmar(text)) return 'my'
  if (hasLao(text)) return 'lo'
  if (hasKhmer(text)) return 'km'
  if (hasLatinLetters(text)) return 'en'
  return 'auto'
}

async function translateMyMemoryChunk(text: string, tl: string): Promise<string | null> {
  const pairTl = MYMEMORY_LANG[tl] || tl || 'en'
  try {
    const detected = detectMyMemorySourceLang(text)
    const pairs = [
      `${detected}|${pairTl}`,
      `th|${pairTl}`,
      `ko|${pairTl}`,
      `en|${pairTl}`,
      `auto|${pairTl}`,
    ].filter((p, i, arr) => arr.indexOf(p) === i)
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

/** 공지 등 고품질: OpenAI 일괄 번역 (키 없으면 null) */
async function translateBatchOpenAI(texts: string[], tl: string): Promise<(string | null)[] | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey || texts.length === 0) return null
  const model =
    process.env.OPENAI_TRANSLATE_MODEL?.trim() ||
    process.env.OPENAI_ERP_AI_MODEL?.trim() ||
    'gpt-4o-mini'
  const langName = LANG_NAME[tl] || tl
  const maxTokens = Math.min(8000, Math.max(800, texts.reduce((n, t) => n + Math.ceil(t.length / 2), 0) + 200))

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              `You are a professional translator for a Thai restaurant franchise (workplace notices, HR policies, short ERP memos). ` +
              `Translate each input string into ${langName}. ` +
              `Preserve meaning, formal workplace tone, numbers, dates, currency, and proper nouns (store/menu/brand names) when appropriate. ` +
              `Do not add explanations. Return JSON only: {"translations":["..."]} with the same length and order as input texts.`,
          },
          {
            role: 'user',
            content: JSON.stringify({ texts }),
          },
        ],
      }),
    })
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      console.warn('translate openai status:', res.status, bodyText.slice(0, 200))
      return null
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    const raw = String(data?.choices?.[0]?.message?.content || '').trim()
    if (!raw) return null
    let parsed: { translations?: unknown } = {}
    try {
      parsed = JSON.parse(raw) as { translations?: unknown }
    } catch {
      console.warn('translate openai json parse fail', raw.slice(0, 120))
      return null
    }
    const arr = Array.isArray(parsed.translations) ? parsed.translations : null
    if (!arr || arr.length !== texts.length) {
      console.warn('translate openai length mismatch', { expect: texts.length, got: arr?.length })
      return null
    }
    return arr.map((v) => {
      const s = String(v ?? '').trim()
      return s || null
    })
  } catch (e) {
    console.warn('translate openai:', e)
    return null
  }
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
  let body: { texts?: unknown[]; text?: unknown; targetLang?: string; quality?: string } = {}
  try {
    body = (await request.json().catch(() => ({}))) as typeof body
    const targetLang = String(body.targetLang || 'ko').toLowerCase().slice(0, 2)
    const quality = String(body.quality || 'fast').toLowerCase() === 'high' ? 'high' : 'fast'
    const texts = Array.isArray(body.texts) ? body.texts : [body.text]

    if (!texts.length) {
      return NextResponse.json({ translated: [] }, { headers })
    }

    const tl = LANG_MAP[targetLang] || targetLang || 'en'
    const sources = texts.map((t) => String(t ?? '').trim())
    const results = sources.map((src) => (src ? '' : ''))
    const needIdx: number[] = []
    const needTexts: string[] = []

    sources.forEach((src, i) => {
      if (!src) {
        results[i] = ''
        return
      }
      if (alreadyTargetLang(src, tl)) {
        results[i] = src
        return
      }
      const hit = cacheGet(`${tl}\0${src}`)
      if (hit !== undefined) {
        results[i] = hit
        return
      }
      needIdx.push(i)
      needTexts.push(src)
    })

    if (needTexts.length > 0 && quality === 'high') {
      for (let offset = 0; offset < needTexts.length; offset += OPENAI_BATCH_MAX) {
        const slice = needTexts.slice(offset, offset + OPENAI_BATCH_MAX)
        const openaiOut = await translateBatchOpenAI(slice, tl)
        if (!openaiOut) continue
        openaiOut.forEach((out, j) => {
          const src = slice[j]!
          const idx = needIdx[offset + j]!
          if (out && !translationLooksFailed(src, out, tl)) {
            results[idx] = out
            cacheSet(`${tl}\0${src}`, out)
          }
        })
      }
    }

    const remainIdx = needIdx.filter((idx) => !results[idx])
    if (remainIdx.length > 0) {
      const filled = await mapPool(remainIdx, CONCURRENCY, async (idx) => {
        const src = sources[idx]!
        const t = await translateOne(src, targetLang)
        return { idx, t: (t && t.trim()) || src }
      })
      filled.forEach(({ idx, t }) => {
        results[idx] = t
      })
    }

    return NextResponse.json({ translated: results }, { headers })
  } catch (e) {
    console.error('translate:', e)
    const texts = Array.isArray(body?.texts) ? body.texts : []
    return NextResponse.json({ translated: texts.map((s: unknown) => String(s ?? '').trim()) }, { headers })
  }
}
