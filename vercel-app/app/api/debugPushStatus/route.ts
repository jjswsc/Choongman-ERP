/**
 * 공지 푸시 알림 진단 API (관리자 점검용)
 * GET /api/debugPushStatus - 푸시 설정·토큰 현황 확인
 */
import { NextResponse } from 'next/server'
import { getNotificationSettings } from '@/lib/notification-settings-server'
import { isFirebaseAdminConfigured } from '@/lib/firebase-admin'
import { supabaseSelect } from '@/lib/supabase-server'

export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const settings = await getNotificationSettings()
    const firebaseOk = isFirebaseAdminConfigured()

    const tokenRows = (await supabaseSelect('push_tokens', {
      select: 'store,name,updated_at',
      limit: 2000,
    })) as { store?: string; name?: string; updated_at?: string }[] | null
    const tokenCount = tokenRows?.length ?? 0

    const empRows = (await supabaseSelect('employees', {
      select: 'store,name,nick',
      limit: 500,
    })) as { store?: string; name?: string; nick?: string }[] | null

    const tokensByKey = new Set<string>()
    for (const t of tokenRows || []) {
      const s = String(t.store || '').trim()
      const n = String(t.name || '').trim()
      if (s && n) tokensByKey.add(`${s}|${n}`)
    }

    const withoutToken: string[] = []
    for (const e of empRows || []) {
      const store = String(e.store || '').trim()
      const name = String(e.name || '').trim()
      const nick = String(e.nick || '').trim()
      if (!store || !name) continue
      const byName = tokensByKey.has(`${store}|${name}`)
      const byNick = nick && nick !== name ? tokensByKey.has(`${store}|${nick}`) : false
      if (!byName && !byNick) {
        withoutToken.push(`${store} - ${name}${nick && nick !== name ? ` (닉:${nick})` : ''}`)
      }
    }

    return NextResponse.json(
      {
        pushNoticeEnabled: settings.pushNoticeEnabled,
        firebaseConfigured: firebaseOk,
        pushTokensCount: tokenCount,
        employeesWithoutToken: withoutToken.slice(0, 20),
        employeesWithoutTokenTotal: withoutToken.length,
        hint: !firebaseOk
          ? 'FIREBASE_SERVICE_ACCOUNT_JSON 환경 변수 설정 필요'
          : tokenCount === 0
            ? 'push_tokens 테이블에 토큰이 없습니다. 수신자가 홈/공지에서 "푸시 받기"를 등록해야 합니다.'
            : withoutToken.length > 0
              ? `${withoutToken.length}명이 푸시 토큰을 등록하지 않았습니다.`
              : '정상',
      },
      { headers }
    )
  } catch (e) {
    console.error('debugPushStatus:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed' },
      { status: 500, headers }
    )
  }
}
