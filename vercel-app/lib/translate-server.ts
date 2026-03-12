/**
 * 서버 전용 번역 유틸 (FCM 알림 등)
 * translate API와 동일한 Google Translate 사용
 */
const LANG_MAP: Record<string, string> = { ko: 'ko', en: 'en', th: 'th', my: 'my', lo: 'lo', mm: 'my', la: 'lo', kh: 'km', vi: 'vi', ms: 'ms' }
const UA = 'Mozilla/5.0 (compatible; ChoongmanERP/1.0)'

async function translateOne(text: string, targetLang: string): Promise<string> {
  const trimmed = String(text || '').trim()
  if (!trimmed) return ''
  const tl = LANG_MAP[targetLang?.toLowerCase()] || targetLang || 'en'
  if (tl === 'ko') return trimmed
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${tl}&dt=t&q=${encodeURIComponent(trimmed.slice(0, 5000))}`
    const resp = await fetch(url, { headers: { 'User-Agent': UA } })
    const data = (await resp.json()) as unknown
    if (Array.isArray(data) && Array.isArray((data as unknown[])[0])) {
      const first = (data as unknown[])[0] as Array<[string | null]>
      const result = first.map((x) => x[0]).filter(Boolean).join('')
      if (result && result.trim()) return result
    }
  } catch (e) {
    console.warn('translate-server:', e)
  }
  return trimmed
}

/**
 * 여러 텍스트를 지정 언어로 번역 (rate limit 고려하여 순차 실행)
 */
export async function translateTextsServer(
  texts: string[],
  targetLang: string
): Promise<string[]> {
  const tl = String(targetLang || 'ko').toLowerCase().slice(0, 2)
  if (tl === 'ko') return texts.map((t) => String(t || '').trim())
  const results: string[] = []
  for (let i = 0; i < texts.length; i++) {
    const t = await translateOne(String(texts[i] || '').trim(), tl)
    results.push(t || String(texts[i] || '').trim())
    if (i < texts.length - 1) await new Promise((r) => setTimeout(r, 80))
  }
  return results
}
