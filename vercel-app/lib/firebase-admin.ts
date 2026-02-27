/**
 * Firebase Admin SDK - FCM 푸시 발송용 (서버 전용)
 * FIREBASE_SERVICE_ACCOUNT_JSON 환경 변수에 서비스 계정 JSON 문자열 설정
 */
import * as admin from 'firebase-admin'
import { supabaseSelectFilter } from './supabase-server'

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
 * store|name 목록에 해당하는 push_tokens 조회 후 FCM 전송
 */
export async function sendFcmToRecipients(params: {
  title: string
  body: string
  recipients: { store: string; name: string }[]
}): Promise<{ sent: number; failed: number }> {
  const app = getAdminApp()
  if (!app) return { sent: 0, failed: 0 }

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
