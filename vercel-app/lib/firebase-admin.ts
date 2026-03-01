/**
 * Firebase Admin SDK - FCM 푸시 발송용 (서버 전용)
 * FIREBASE_SERVICE_ACCOUNT_JSON 환경 변수에 서비스 계정 JSON 문자열 설정
 * 수신자별 lang에 맞게 자동 번역 후 발송
 */
import * as admin from 'firebase-admin'
import { supabaseSelect, supabaseSelectFilter } from './supabase-server'
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
    select: 'store,name,job,role',
    limit: 500,
  })) as { store?: string; name?: string; job?: string; role?: string }[] | null
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

  const result: { store: string; name: string }[] = []
  for (const emp of empRows) {
    const store = String(emp.store || '').trim()
    const name = String(emp.name || '').trim()
    if (!store || !name) continue

    const myJob = String(emp.job || emp.role || '').trim().toLowerCase()
    const myRole = String(emp.role || '').trim().toLowerCase()
    const storeMatch = storeMatchAll || storeList.includes(store)
    const roleMatch = roleMatchAll || (myJob && roleList.includes(myJob))
    const permMatch = permMatchAll || (myRole && permList.includes(myRole))
    if (storeMatch && roleMatch && permMatch) result.push({ store, name })
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
  recipients: { store: string; name: string }[]
}): Promise<{ sent: number; failed: number }> {
  const { title, body, recipients } = params
  const app = getAdminApp()
  if (!app) {
    if (recipients?.length) console.warn('FCM skipped: FIREBASE_SERVICE_ACCOUNT_JSON not set')
    return { sent: 0, failed: 0 }
  }
  if (!recipients?.length) return { sent: 0, failed: 0 }

  // token + lang 조회 (lang 없으면 ko로 처리)
  const tokenLangList: { token: string; lang: string }[] = []
  for (const r of recipients) {
    if (!r.store?.trim() || !r.name?.trim()) continue
    const rows = (await supabaseSelectFilter(
      'push_tokens',
      `store=eq.${encodeURIComponent(r.store.trim())}&name=eq.${encodeURIComponent(r.name.trim())}`,
      { select: 'token,lang', limit: 1 }
    )) as { token?: string; lang?: string }[] | null
    const row = rows?.[0]
    if (row?.token) {
      const lang = String(row.lang || 'ko').toLowerCase().slice(0, 2)
      const normalized = lang === 'mm' ? 'my' : lang === 'la' ? 'lo' : lang
      tokenLangList.push({ token: row.token, lang: normalized || 'ko' })
    }
  }

  // 토큰 중복 제거 (동일 토큰이면 첫 lang 사용)
  const seen = new Set<string>()
  const unique: { token: string; lang: string }[] = []
  for (const t of tokenLangList) {
    if (!t.token || seen.has(t.token)) continue
    seen.add(t.token)
    unique.push(t)
  }

  if (unique.length === 0) return { sent: 0, failed: 0 }

  // lang별로 그룹화
  const byLang = new Map<string, string[]>()
  for (const { token, lang } of unique) {
    const key = ['ko', 'en', 'th', 'my', 'lo'].includes(lang) ? lang : 'ko'
    if (!byLang.has(key)) byLang.set(key, [])
    byLang.get(key)!.push(token)
  }

  const messaging = admin.messaging()
  let sent = 0
  let failed = 0
  const appName = 'CM ERP'

  for (const [lang, tokens] of byLang) {
    let finalTitle = title.startsWith('[') ? title : `[${appName}] ${title}`
    let finalBody = body

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
      const message: admin.messaging.MulticastMessage = {
        tokens: chunk,
        data: { title: finalTitle, body: finalBody.slice(0, 100) },
      }
      try {
        const res = await messaging.sendEachForMulticast(message)
        sent += res.successCount
        failed += res.failureCount
      } catch (e) {
        console.error('FCM sendEachForMulticast:', e)
        failed += chunk.length
      }
    }
  }

  return { sent, failed }
}
