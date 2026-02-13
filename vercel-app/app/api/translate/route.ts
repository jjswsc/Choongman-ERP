/**
 * 사용자 입력 텍스트 번역 API (내용/memo 등)
 * POST body: { texts: string[], targetLang: string } → { translated: string[] }
 * targetLang: ko, en, th, mm, la (mm→my, la→lo 변환)
 * 원문 언어 자동 감지 (sl=auto)
 */
import { NextRequest, NextResponse } from 'next/server'

const LANG_MAP: Record<string, string> = { ko: 'ko', en: 'en', th: 'th', mm: 'my', la: 'lo' }
const UA = 'Mozilla/5.0 (compatible; ChoongmanERP/1.0)'

async function translateOne(text: string, targetLang: string): Promise<string> {
  const trimmed = String(text || '').trim()
  if (!trimmed) return ''
  const tl = LANG_MAP[targetLang] || targetLang || 'en'
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
    console.warn('translate google:', e)
  }
  return trimmed
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  let body: { texts?: unknown[]; text?: unknown; targetLang?: string } = {}
  try {
    body = (await request.json().catch(() => ({}))) as typeof body
    const targetLang = String(body.targetLang || 'ko').toLowerCase().slice(0, 2)
    const texts = Array.isArray(body.texts) ? body.texts : [body.text]

    if (!texts.length) {
      return NextResponse.json({ translated: [] }, { headers })
    }

    const results: string[] = []
    for (let i = 0; i < texts.length; i++) {
      const t = await translateOne(String(texts[i] || ''), targetLang)
      results.push(t)
      if (i < texts.length - 1) await new Promise((r) => setTimeout(r, 80))
    }
    return NextResponse.json({ translated: results }, { headers })
  } catch (e) {
    console.error('translate:', e)
    const texts = Array.isArray(body?.texts) ? body.texts : []
    return NextResponse.json({ translated: texts.map((s: unknown) => String(s ?? '').trim()) }, { headers })
  }
}
