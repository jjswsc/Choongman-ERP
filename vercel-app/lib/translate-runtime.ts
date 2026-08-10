/**
 * 서버 런타임 번역 (Google gtx → MyMemory 폴백)
 * /api/translate · getMyNotices(lang) · FCM 등에서 공유
 */
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

export function normalizeTranslateTargetLang(targetLang: string): string {
  const raw = String(targetLang || 'ko').toLowerCase().slice(0, 2)
  return LANG_MAP[raw] || raw || 'en'
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

export async function translateOneRuntime(text: string, targetLang: string): Promise<string> {
  const trimmed = String(text || '').trim()
  if (!trimmed) return ''
  const tl = normalizeTranslateTargetLang(targetLang)
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

/** 여러 텍스트 병렬 번역 (동일 원문은 캐시 공유) */
export async function translateTextsRuntime(
  texts: string[],
  targetLang: string,
  concurrency = CONCURRENCY
): Promise<string[]> {
  const sources = texts.map((t) => String(t ?? '').trim())
  return mapPool(sources, concurrency, async (src) => {
    const t = await translateOneRuntime(src, targetLang)
    return (t && t.trim()) || src
  })
}
