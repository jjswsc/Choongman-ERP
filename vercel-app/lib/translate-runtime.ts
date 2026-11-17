/**
 * 서버 런타임 번역
 * 우선순위: 캐시 → OpenAI(gpt-4o-mini, OPENAI_API_KEY 있을 때) → Google gtx → MyMemory
 * /api/translate · getMyNotices(lang) · FCM · 일정표 업무 문구 등에서 공유
 *
 * 품질: 용어집 보호/복원 + 메모리·DB(translate_cache) 이중 캐시
 */
import { createHash } from 'node:crypto'
import {
  applyGlossaryPostCorrect,
  protectGlossaryTerms,
  restoreGlossaryTerms,
  type GlossaryEntry,
} from '@/lib/translate-glossary'

type GlossarySlots = GlossaryEntry[]

const LANG_MAP: Record<string, string> = {
  ko: 'ko',
  en: 'en',
  th: 'th',
  mm: 'my',
  la: 'lo',
  kh: 'km',
  vi: 'vi',
  ms: 'ms',
  my: 'my',
  lo: 'lo',
  km: 'km',
  zh: 'zh',
  ja: 'ja',
  ru: 'ru',
  hi: 'hi',
  ar: 'ar',
  pt: 'pt',
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
  zh: 'zh',
  ja: 'ja',
  ru: 'ru',
  hi: 'hi',
  ar: 'ar',
  pt: 'pt',
}
const LANG_LABEL: Record<string, string> = {
  ko: 'Korean',
  en: 'English',
  th: 'Thai',
  my: 'Burmese (Myanmar)',
  lo: 'Lao',
  km: 'Khmer',
  vi: 'Vietnamese',
  ms: 'Malay',
  zh: 'Chinese',
  ja: 'Japanese',
  ru: 'Russian',
  hi: 'Hindi',
  ar: 'Arabic',
  pt: 'Portuguese',
}
const UA = 'Mozilla/5.0 (compatible; ChoongmanERP/1.0)'
const CONCURRENCY = 4
const CACHE_MAX = 800
const GOOGLE_CHUNK = 4500
const MYMEMORY_CHUNK = 450
const OPENAI_BATCH_MAX = 15
const OPENAI_BATCH_CHARS = 3500

type PendingTranslate = {
  index: number
  source: string
  protectedText: string
  slots: GlossarySlots
}

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

function cacheKeyHash(tl: string, source: string): string {
  return createHash('sha256').update(`${tl}\0${source}`, 'utf8').digest('hex')
}

async function dbCacheGet(hash: string): Promise<string | null> {
  try {
    const { supabaseSelectFilter } = await import('@/lib/supabase-server')
    const rows = (await supabaseSelectFilter(
      'translate_cache',
      `cache_key=eq.${encodeURIComponent(hash)}`,
      { limit: 1, select: 'translated' }
    )) as Array<{ translated?: string }>
    const t = String(rows?.[0]?.translated || '').trim()
    return t || null
  } catch {
    return null
  }
}

async function dbCacheSet(
  hash: string,
  source: string,
  tl: string,
  translated: string
): Promise<void> {
  try {
    const { supabaseUpsert } = await import('@/lib/supabase-server')
    await supabaseUpsert(
      'translate_cache',
      [
        {
          cache_key: hash,
          source_text: source.slice(0, 8000),
          target_lang: tl,
          translated: translated.slice(0, 8000),
          updated_at: new Date().toISOString(),
        },
      ],
      'cache_key'
    )
  } catch {
    /* 테이블 미배포·일시 오류 시 무시 */
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

export function normalizeTranslateTargetLang(targetLang: string): string {
  const raw = String(targetLang || 'ko').toLowerCase().slice(0, 2)
  return LANG_MAP[raw] || raw || 'en'
}

export function targetLangLabel(tl: string): string {
  return LANG_LABEL[tl] || tl
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
    if (tl === 'lo' && !hasLao(b) && (hasThai(b) || hasHangul(b))) return true
    return false
  }
  if (tl === 'ko') return hasThai(a) || hasMyanmar(a) || hasLao(a) || hasKhmer(a)
  if (tl === 'my') return hasThai(a) || hasHangul(a) || hasLao(a) || hasKhmer(a)
  if (tl === 'lo') return hasThai(a) || hasHangul(a) || hasMyanmar(a)
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

function openaiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

function openaiTranslateModel(): string {
  return (
    process.env.OPENAI_TRANSLATE_MODEL?.trim() ||
    process.env.OPENAI_ERP_AI_MODEL?.trim() ||
    'gpt-4o-mini'
  )
}

/** OpenAI 응답에서 동일 길이 JSON 문자열 배열 파싱 (테스트용 export) */
export function parseOpenAiTranslatedArray(raw: string, expectedLen: number): (string | null)[] {
  const empty = () => Array.from({ length: expectedLen }, () => null)
  if (expectedLen <= 0) return []
  const cleaned = String(raw || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  if (!cleaned) return empty()

  const tryParse = (s: string): (string | null)[] | null => {
    try {
      const parsed = JSON.parse(s) as unknown
      if (!Array.isArray(parsed) || parsed.length !== expectedLen) return null
      return parsed.map((x) => {
        const t = String(x ?? '').trim()
        return t || null
      })
    } catch {
      return null
    }
  }

  const direct = tryParse(cleaned)
  if (direct) return direct

  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start >= 0 && end > start) {
    const sliced = tryParse(cleaned.slice(start, end + 1))
    if (sliced) return sliced
  }
  return empty()
}

function splitOpenAiBatches(texts: string[]): string[][] {
  const batches: string[][] = []
  let cur: string[] = []
  let chars = 0
  for (const text of texts) {
    const len = text.length
    const wouldExceed =
      cur.length > 0 && (cur.length >= OPENAI_BATCH_MAX || chars + len > OPENAI_BATCH_CHARS)
    if (wouldExceed) {
      batches.push(cur)
      cur = []
      chars = 0
    }
    cur.push(text)
    chars += len
  }
  if (cur.length) batches.push(cur)
  return batches
}

async function translateOpenAiBatch(texts: string[], tl: string): Promise<(string | null)[]> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey || texts.length === 0) return texts.map(() => null)

  const model = openaiTranslateModel()
  const langName = targetLangLabel(tl)
  const maxTokens = Math.min(4000, Math.max(256, Math.ceil(texts.join('\n').length * 1.2) + 64))

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: maxTokens,
        messages: [
          {
            role: 'system',
            content:
              `You translate short staff notes for a Thailand restaurant franchise ERP.\n` +
              `Translate each string into ${langName}.\n` +
              `Rules:\n` +
              `- Keep meaning natural for store employees.\n` +
              `- Preserve placeholders like __CMTERM_0__ exactly.\n` +
              `- Preserve numbers, currency amounts, dates, and codes.\n` +
              `- Do not add explanations or labels.\n` +
              `- Reply with ONLY a JSON array of strings, same length and order as the input.`,
          },
          {
            role: 'user',
            content: JSON.stringify(texts),
          },
        ],
      }),
    })
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      console.warn('translate openai status:', res.status, bodyText.slice(0, 200))
      return texts.map(() => null)
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const content = String(data?.choices?.[0]?.message?.content || '')
    const parsed = parseOpenAiTranslatedArray(content, texts.length)
    return parsed.map((out, i) => {
      if (out == null) return null
      const src = texts[i] || ''
      if (translationLooksFailed(src, out, tl)) return null
      return out
    })
  } catch (e) {
    console.warn('translate openai:', e)
    return texts.map(() => null)
  }
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

async function translateLegacyProvidersRaw(text: string, tl: string): Promise<string | null> {
  let out = await translateViaProvider(text, tl, 'google')
  if (out == null || translationLooksFailed(text, out, tl)) {
    const fb = await translateViaProvider(text, tl, 'mymemory')
    if (fb != null && !translationLooksFailed(text, fb, tl)) {
      out = fb
    } else if (out == null) {
      out = fb
    }
  }
  return out
}

function finalizeTranslated(
  source: string,
  rawOut: string | null,
  slots: GlossarySlots,
  tl: string
): string {
  let finalOut = (rawOut && rawOut.trim()) || source
  if (slots.length > 0) {
    finalOut = restoreGlossaryTerms(finalOut, slots, tl)
  }
  finalOut = applyGlossaryPostCorrect(finalOut, tl)
  return finalOut
}

function storeIfGood(source: string, finalOut: string, tl: string): void {
  if (translationLooksFailed(source, finalOut, tl)) {
    console.warn('translate failed to change script', { tl, sample: source.slice(0, 40) })
    return
  }
  const memKey = `${tl}\0${source}`
  const hash = cacheKeyHash(tl, source)
  cacheSet(memKey, finalOut)
  void dbCacheSet(hash, source, tl, finalOut)
}

async function translatePendingLegacy(
  item: PendingTranslate,
  tl: string
): Promise<string> {
  let out = await translateLegacyProvidersRaw(item.protectedText, tl)
  if (out == null && item.protectedText !== item.source) {
    out = await translateLegacyProvidersRaw(item.source, tl)
  }
  const finalOut = finalizeTranslated(item.source, out, item.slots, tl)
  storeIfGood(item.source, finalOut, tl)
  return finalOut
}

export async function translateOneRuntime(text: string, targetLang: string): Promise<string> {
  const [out] = await translateTextsRuntime([text], targetLang, 1)
  return out ?? ''
}

/** 여러 텍스트 병렬 번역 (동일 원문은 캐시 공유, OpenAI는 배치) */
export async function translateTextsRuntime(
  texts: string[],
  targetLang: string,
  concurrency = CONCURRENCY
): Promise<string[]> {
  const tl = normalizeTranslateTargetLang(targetLang)
  const sources = texts.map((t) => String(t ?? '').trim())
  const results = sources.slice()
  const pending: PendingTranslate[] = []

  for (let i = 0; i < sources.length; i++) {
    const trimmed = sources[i] || ''
    if (!trimmed) {
      results[i] = ''
      continue
    }
    if (alreadyTargetLang(trimmed, tl)) {
      results[i] = trimmed
      continue
    }

    const memKey = `${tl}\0${trimmed}`
    const cached = cacheGet(memKey)
    if (cached !== undefined) {
      results[i] = cached
      continue
    }

    const hash = cacheKeyHash(tl, trimmed)
    const fromDb = await dbCacheGet(hash)
    if (fromDb) {
      cacheSet(memKey, fromDb)
      results[i] = fromDb
      continue
    }

    const { text: protectedText, slots } = protectGlossaryTerms(trimmed)
    pending.push({ index: i, source: trimmed, protectedText, slots })
  }

  let stillPending = pending

  if (openaiConfigured() && stillPending.length > 0) {
    const batches = splitOpenAiBatches(stillPending.map((p) => p.protectedText))
    let offset = 0
    const nextPending: PendingTranslate[] = []

    for (const batchTexts of batches) {
      const batchItems = stillPending.slice(offset, offset + batchTexts.length)
      offset += batchTexts.length
      const openaiOuts = await translateOpenAiBatch(batchTexts, tl)

      for (let j = 0; j < batchItems.length; j++) {
        const item = batchItems[j]!
        const oi = openaiOuts[j]
        if (oi != null) {
          const finalOut = finalizeTranslated(item.source, oi, item.slots, tl)
          if (!translationLooksFailed(item.source, finalOut, tl)) {
            storeIfGood(item.source, finalOut, tl)
            results[item.index] = finalOut
            continue
          }
        }
        nextPending.push(item)
      }
    }
    stillPending = nextPending
  }

  if (stillPending.length > 0) {
    await mapPool(stillPending, concurrency, async (item) => {
      const finalOut = await translatePendingLegacy(item, tl)
      results[item.index] = (finalOut && finalOut.trim()) || item.source
      return finalOut
    })
  }

  return results.map((t, i) => (t && t.trim()) || sources[i] || '')
}
