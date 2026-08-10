/**
 * 사용자 입력 텍스트 번역 API (내용/memo·공지 등)
 * POST body: { texts: string[], targetLang: string } → { translated: string[] }
 *
 * 인증: Bearer/쿠키 있으면 검증하되, 공지 화면처럼 세션만 남은 경우에도 번역은 허용
 * (getMyNotices는 JWT 없이도 동작 — 번역만 401이면 태국어 원문이 그대로 보임)
 */
import { NextRequest, NextResponse } from 'next/server'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { translateTextsRuntime } from '@/lib/translate-runtime'

const MAX_TEXTS = 40
const MAX_CHARS = 5000

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  // 가능하면 인증 확인(감사·정지 계정)하되, 실패해도 번역은 진행
  try {
    await getVerifiedAuth(request)
  } catch {
    /* ignore */
  }

  let body: { texts?: unknown[]; text?: unknown; targetLang?: string } = {}
  try {
    body = (await request.json().catch(() => ({}))) as typeof body
    const targetLang = String(body.targetLang || 'ko').toLowerCase().slice(0, 2)
    const rawTexts = Array.isArray(body.texts) ? body.texts : [body.text]
    const texts = rawTexts
      .slice(0, MAX_TEXTS)
      .map((t) => String(t ?? '').trim().slice(0, MAX_CHARS))

    if (!texts.length) {
      return NextResponse.json({ translated: [] }, { headers })
    }

    const translated = await translateTextsRuntime(texts, targetLang)
    return NextResponse.json({ translated }, { headers })
  } catch (e) {
    console.error('translate:', e)
    const texts = Array.isArray(body?.texts) ? body.texts : []
    return NextResponse.json(
      { translated: texts.map((s: unknown) => String(s ?? '').trim().slice(0, MAX_CHARS)) },
      { headers }
    )
  }
}
