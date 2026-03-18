/**
 * Firebase Admin SDK - FCM 푸시 발송용 (서버 전용)
 * FIREBASE_SERVICE_ACCOUNT_JSON 환경 변수에 서비스 계정 JSON 문자열 설정
 * 수신자별 lang에 맞게 자동 번역 후 발송
 */
import * as admin from 'firebase-admin'
import { supabaseSelect, supabaseSelectFilter, supabaseDeleteByFilter } from './supabase-server'
import { translateTextsServer } from './translate-server'

let initialized = false

function getAdminApp(): admin.app.App | null {
  if (initialized) return admin.apps[0] as admin.app.App
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!json?.trim()) return null
  try {
    const cred = JSON.parse(json)
    admin.initializeApp({ credential: admin.credential.cert(cred) })
    initialized = true
    return admin.app()
  } catch (e) {
    console.error('Firebase Admin init:', e)
    return null
  }
}

export function isFirebaseAdminConfigured(): boolean {
  return !!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim())
}

/**
 * targetStore, targetRole 기준으로 수신 대상(store|name) 목록 조회
 * getMyNotices와 동일한 매칭 로직 사용
 */
export async function getRecipientsByTargetStoreRole(
  targetStore: string,
  targetRole: string,
  targetPermissionGroup?: string | null
): Promise<{ store: string; name: string }[]> {
  const empRows = (await supabaseSelect('employees', {
    select: 'store,name,nick,job,role',
    limit: 500,
  })) as { store?: string; name?: string; nick?: string; job?: string; role?: string }[] | null
  if (!empRows?.length) return []

  const storeList = String(targetStore || '전체').split(',').map((s) => s.trim()).filter(Boolean)
  const roleList = String(targetRole || '전체')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const storeMatchAll = storeList.length === 0 || (storeList.length === 1 && storeList[0] === '전체')
  const roleMatchAll = roleList.length === 0 || (roleList.length === 1 && roleList[0] === '전체')
  const permList = (targetPermissionGroup || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  const permMatchAll = permList.length === 0

  const result: { store: string; name: string; nick?: string }[] = []
  for (const emp of empRows) {
    const store = String(emp.store || '').trim()
    const name = String(emp.name || '').trim()
    if (!store || !name) continue

    const myJob = String(emp.job || emp.role || '').trim().toLowerCase()
    const myRole = String(emp.role || '').trim().toLowerCase()
    const storeMatch = storeMatchAll || storeList.includes(store)
    const roleMatch = roleMatchAll || (myJob && roleList.includes(myJob))
    const permMatch = permMatchAll || (myRole && permList.includes(myRole))
    if (storeMatch && roleMatch && permMatch) {
      const nick = String(emp.nick || emp.name || '').trim() || undefined
      result.push({ store, name, nick: nick && nick !== name ? nick : undefined })
    }
  }
  return result
}

/**
 * store|name 목록에 해당하는 push_tokens 조회 후 FCM 전송
 * 수신자별 lang(선호 언어)에 맞게 title/body 자동 번역
 */
export async function sendFcmToRecipients(params: {
  title: string
  body: string
  recipients: { store: string; name: string; nick?: string }[]
}): Promise<{ sent: number; failed: number }> {
  const { title, body, recipients } = params
  const app = getAdminApp()
  if (!app) {
    if (recipients?.length) console.warn('FCM skipped: FIREBASE_SERVICE_ACCOUNT_JSON not set')
    return { sent: 0, failed: 0 }
  }
  if (!recipients?.length) return { sent: 0, failed: 0 }

  // push_tokens 전부 조회 후 수신자와 매칭 (store/name 대소문자·공백 차이 시 유연 매칭)
  const allTokenRows = (await supabaseSelect('push_tokens', {
    select: 'store,name,token,lang',
    limit: 2000,
  })) as { store?: string; name?: string; token?: string; lang?: string }[] | null

  const norm = (s: string) => s.toLowerCase().trim()
  const tokenMap = new Map<string, { token: string; lang: string; store: string; name: string }>()
  for (const row of allTokenRows || []) {
    const store = String(row.store || '').trim()
    const name = String(row.name || '').trim()
    if (!store || !name || !row.token) continue
    const key = `${norm(store)}|${norm(name)}`
    if (!tokenMap.has(key)) {
      const lang = String(row.lang || 'ko').toLowerCase().slice(0, 2)
      const normalized = lang === 'mm' ? 'my' : lang === 'la' ? 'lo' : lang === 'kh' ? 'km' : lang
      tokenMap.set(key, { token: row.token, lang: normalized || 'ko', store, name })
    }
  }

  const tokenLangList: { token: string; lang: string; store: string; name: string }[] = []
  for (const r of recipients) {
    if (!r.store?.trim()) continue
    const store = r.store.trim()
    const name = r.name?.trim()
    const nick = r.nick?.trim()
    const keysToTry = [
      `${norm(store)}|${norm(name)}`,
      ...(nick && nick !== name ? [`${norm(store)}|${norm(nick)}`] : []),
    ]
    for (const key of keysToTry) {
      const found = tokenMap.get(key)
      if (found) {
        tokenLangList.push({ ...found, name: r.name.trim() })
        break
      }
    }
  }

  // 토큰 중복 제거 (동일 토큰이면 첫 lang 사용), token → store/name 매핑 유지
  const seen = new Set<string>()
  const unique: { token: string; lang: string }[] = []
  const tokenToRecipient = new Map<string, { store: string; name: string }>()
  for (const t of tokenLangList) {
    if (!t.token || seen.has(t.token)) continue
    seen.add(t.token)
    unique.push({ token: t.token, lang: t.lang })
    tokenToRecipient.set(t.token, { store: t.store, name: t.name })
  }

  if (unique.length === 0) {
    if (recipients.length > 0) console.warn('FCM: 수신자', recipients.length, '명 중 push_tokens 등록된 토큰 없음')
    return { sent: 0, failed: 0 }
  }

  // lang별로 그룹화
  const byLang = new Map<string, string[]>()
  for (const { token, lang } of unique) {
        const key = ['ko', 'en', 'th', 'my', 'lo', 'km', 'vi', 'ms'].includes(lang) ? lang : 'ko'
    if (!byLang.has(key)) byLang.set(key, [])
    byLang.get(key)!.push(token)
  }

  const messaging = admin.messaging()
  let sent = 0
  let failed = 0
  const appName = 'CM ERP'

  for (const [lang, tokens] of byLang) {
    let finalTitle = title.startsWith('[') ? title : `[${appName}] ${title}`
    let finalBody = body.slice(0, 100)

    if (lang !== 'ko') {
      try {
        const [transTitle, transBody] = await translateTextsServer([finalTitle, finalBody], lang)
        if (transTitle?.trim()) finalTitle = transTitle
        if (transBody?.trim()) finalBody = transBody
      } catch (e) {
        console.warn('FCM translate fallback:', e)
      }
    }

    const batchSize = 500
    for (let i = 0; i < tokens.length; i += batchSize) {
      const chunk = tokens.slice(i, i + batchSize)
      // data-only 페이로드: notification 제거 시 브라우저 자동 표시(무음) 대신
      // Service Worker onBackgroundMessage가 항상 호출되어 vibrate/silent:false 적용 가능
      const tag = `cm-erp-notice-${Date.now()}-${i}` // unique tag: 연속 공지 시 renotify로 소리 재생
      const message: admin.messaging.MulticastMessage = {
        tokens: chunk,
        data: { title: finalTitle, body: finalBody, tag },
        webpush: {
          headers: { TTL: '3600', Urgency: 'high' },
          fcmOptions: { link: '/' },
        },
      }
      try {
        const res = await messaging.sendEachForMulticast(message)
        sent += res.successCount
        failed += res.failureCount
        if (res.failureCount > 0 && res.responses) {
          res.responses.forEach((r, idx) => {
            if (!r.success && r.error) {
              console.warn('FCM 실패:', r.error.code, r.error.message)
              // 만료/미등록 토큰이면 push_tokens에서 삭제 → 다음 앱 접속 시 "푸시 받기" 재등록 유도
              const code = String(r.error?.code || '')
              if (code === 'messaging/registration-token-not-registered' || code.includes('not-found')) {
                const token = chunk[idx]
                const rec = tokenToRecipient.get(token)
                if (rec?.store && rec?.name) {
                  supabaseDeleteByFilter(
                    'push_tokens',
                    `store=eq.${encodeURIComponent(rec.store)}&name=eq.${encodeURIComponent(rec.name)}`
                  ).then(() => console.info('FCM: 만료 토큰 삭제', rec.store, rec.name)).catch((e) => console.warn('FCM 토큰 삭제 실패:', e))
                }
              }
            }
          })
        }
      } catch (e) {
        console.error('FCM sendEachForMulticast:', e)
        failed += chunk.length
      }
    }
  }

  return { sent, failed }
}
