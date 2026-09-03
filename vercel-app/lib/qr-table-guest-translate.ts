/** QR 손님 메뉴 설명 자동 번역 — /api/translate (Google → MyMemory) */

const CHUNK = 40
const cache = new Map<string, string>()
const CACHE_MAX = 800

function cacheKey(lang: string, text: string) {
  return `${lang}\0${text}`
}

function cacheGet(lang: string, text: string): string | undefined {
  return cache.get(cacheKey(lang, text))
}

function cacheSet(lang: string, text: string, value: string) {
  const key = cacheKey(lang, text)
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

export function uniqueQrGuestDescriptions(items: Array<{ description?: string; descriptionDefault?: string }>): string[] {
  const set = new Set<string>()
  for (const m of items) {
    const d = String(m.description || m.descriptionDefault || '').trim()
    if (d) set.add(d)
  }
  return [...set]
}

export async function translateQrGuestDescriptions(
  texts: string[],
  targetLang: string
): Promise<Record<string, string>> {
  const unique = [...new Set(texts.map((s) => String(s || '').trim()).filter(Boolean))]
  const map: Record<string, string> = {}
  const tl = String(targetLang || 'th').toLowerCase().slice(0, 2)
  if (!unique.length || !tl) return map
  if (tl === 'th') {
    unique.forEach((src) => {
      map[src] = src
    })
    return map
  }

  const missing: string[] = []
  unique.forEach((src) => {
    const hit = cacheGet(tl, src)
    if (hit !== undefined) map[src] = hit
    else missing.push(src)
  })

  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK)
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texts: chunk, targetLang: tl }),
      })
      const data = (await res.json().catch(() => ({}))) as { translated?: unknown }
      const translated = Array.isArray(data.translated) ? data.translated : []
      chunk.forEach((src, j) => {
        const out = String(translated[j] ?? src).trim() || src
        map[src] = out
        if (out !== src) cacheSet(tl, src, out)
      })
    } catch {
      chunk.forEach((src) => {
        if (!map[src]) map[src] = src
      })
    }
  }
  return map
}
