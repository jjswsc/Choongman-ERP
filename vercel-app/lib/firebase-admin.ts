/**
 * Firebase Admin SDK - FCM 푸시 발송용 (서버 전용)
 * FIREBASE_SERVICE_ACCOUNT_JSON 환경 변수에 서비스 계정 JSON 문자열 설정
 */
import * as admin from 'firebase-admin'
import { supabaseSelect, supabaseSelectFilter } from './supabase-server'

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
  targetRole: string
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

  const result: { store: string; name: string }[] = []
  for (const emp of empRows) {
    const store = String(emp.store || '').trim()
    const name = String(emp.name || '').trim()
    if (!store || !name) continue

    const myJob = String(emp.job || emp.role || '').trim().toLowerCase()
    const storeMatch = storeMatchAll || storeList.includes(store)
    const roleMatch = roleMatchAll || (myJob && roleList.includes(myJob))
    if (storeMatch && roleMatch) result.push({ store, name })
  }
  return result
}

/**
 * store|name 목록에 해당하는 push_tokens 조회 후 FCM 전송
 */
export async function sendFcmToRecipients(params: {
  title: string
  body: string
  recipients: { store: string; name: string }[]
}): Promise<{ sent: number; failed: number }> {
  const app = getAdminApp()
  if (!app) {
    if (recipients?.length) console.warn('FCM skipped: FIREBASE_SERVICE_ACCOUNT_JSON not set')
    return { sent: 0, failed: 0 }
  }

  const { title, body, recipients } = params
  if (!recipients?.length) return { sent: 0, failed: 0 }

  const tokens: string[] = []
  for (const r of recipients) {
    if (!r.store?.trim() || !r.name?.trim()) continue
    const rows = (await supabaseSelectFilter(
      'push_tokens',
      `store=eq.${encodeURIComponent(r.store.trim())}&name=eq.${encodeURIComponent(r.name.trim())}`,
      { select: 'token', limit: 1 }
    )) as { token?: string }[] | null
    if (rows?.[0]?.token) tokens.push(rows[0].token)
  }

  const uniqueTokens = [...new Set(tokens)].filter(Boolean)
  if (uniqueTokens.length === 0) return { sent: 0, failed: 0 }

  const messaging = admin.messaging()
  let sent = 0
  let failed = 0

  const appName = 'CM ERP'
  const displayTitle = title.startsWith('[') ? title : `[${appName}] ${title}`

  // FCM은 한 번에 500개까지. 배치로 나눠 전송
  const batchSize = 500
  for (let i = 0; i < uniqueTokens.length; i += batchSize) {
    const chunk = uniqueTokens.slice(i, i + batchSize)
    const message: admin.messaging.MulticastMessage = {
      tokens: chunk,
      notification: { title: displayTitle, body },
      data: { title: displayTitle, body },
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

  return { sent, failed }
}
