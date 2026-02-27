"use client"

import { getApps, initializeApp, getApp, type FirebaseApp } from "firebase/app"
import { getMessaging, getToken, isSupported, type Messaging } from "firebase/messaging"

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

function getFirebaseApp(): FirebaseApp | null {
  if (typeof window === "undefined") return null
  if (getApps().length > 0) return getApp()
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) return null
  return initializeApp(firebaseConfig)
}

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY

export function isFirebaseConfigured(): boolean {
  return !!(
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    VAPID_KEY
  )
}

/** 브라우저 알림 권한 요청 (getFcmToken 전에 먼저 호출 권장 - Safari/iOS 대응) */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined") return "denied"
  if (typeof Notification === "undefined") return "denied"
  if (Notification.permission !== "default") return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return "denied"
  }
}

export type FcmTokenError = "unsupported" | "webview" | "permission" | "network" | "unknown"

/** 페이지 로드 시 미리 호출하여 SW 등록 - 푸시 받기 클릭 시 준비 완료되도록 */
export function preRegisterServiceWorker(): void {
  if (typeof window === "undefined" || !navigator?.serviceWorker?.register) return
  if (!isFirebaseConfigured()) return
  navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" }).catch(() => {})
}

export async function getFcmToken(
  onError?: (err: FcmTokenError, detail?: string) => void
): Promise<string | null> {
  if (typeof window === "undefined") return null
  if (!isFirebaseConfigured() || !VAPID_KEY) return null

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
  if (/wv|WebView|; wv\)/i.test(ua)) {
    onError?.("webview", "앱 내 브라우저에서는 알림이 지원되지 않습니다.")
    return null
  }

  const supported = await isSupported()
  if (!supported) {
    onError?.("unsupported", "이 브라우저는 푸시 알림을 지원하지 않습니다.")
    return null
  }

  const app = getFirebaseApp()
  if (!app) {
    onError?.("unknown", "Firebase 설정이 누락되었습니다. (API Key, Project ID 확인)")
    return null
  }

  if (typeof window !== "undefined" && !window.isSecureContext) {
    onError?.("unknown", "푸시 알림은 HTTPS 또는 localhost에서만 동작합니다.")
    return null
  }

  try {
    const maxRetries = 3
    let lastError: unknown = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // 이전 시도에서 SW가 아직 준비되지 않은 경우, 대기 후 재시도
      if (attempt > 0) {
        const waitMs = attempt * 3000
        await new Promise((r) => setTimeout(r, waitMs))
      }

      const registration = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" })

      // SW가 active 상태가 될 때까지 대기
      await new Promise<void>((resolve) => {
        if (registration.active) {
          resolve()
          return
        }
        const sw = registration.installing || registration.waiting
        if (sw) {
          const onStateChange = () => {
            if (registration.active) {
              sw.removeEventListener("statechange", onStateChange)
              resolve()
            }
          }
          sw.addEventListener("statechange", onStateChange)
          setTimeout(() => {
            sw.removeEventListener("statechange", onStateChange)
            resolve()
          }, 15000)
        } else {
          resolve()
        }
      })

      // SW 활성화 직후 PushManager 준비 대기 (모바일에서 더 필요할 수 있음)
      await new Promise((r) => setTimeout(r, attempt === 0 ? 2000 : 1000))

      const messaging = getMessaging(app)
      const token = await getToken(messaging, {
        vapidKey: VAPID_KEY,
        serviceWorkerRegistration: registration,
      })
      return token
    } catch (e) {
      lastError = e
      const msg = e instanceof Error ? e.message : String(e)
      const isSwNotReady = /subscribing|subscribe|Subscription failed|no active Service Worker|Service Worker/i.test(msg)
      if (isSwNotReady && attempt < maxRetries - 1) continue
      throw e
    }
    }

    if (lastError) throw lastError
    return null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/permission|denied/i.test(msg)) onError?.("permission", msg)
    else if (/push service not available|Registration failed/i.test(msg))
      onError?.("webview", "Chrome 앱을 열고 주소를 직접 입력해 접속한 뒤 시도하세요. (앱 내 브라우저·Safari·구버전 X)")
    else if (/subscribing|subscribe|Subscription failed|no active Service Worker/i.test(msg))
      onError?.("unknown", "브라우저를 새로고침한 뒤 다시 시도해 주세요. (Service Worker 준비 전에 요청된 경우)")
    else if (/service worker|registration|firebase-messaging-sw|unable to register/i.test(msg))
      onError?.("unknown", "Service Worker 등록 실패. HTTPS로 접속했는지, /firebase-messaging-sw.js 접속이 되는지 확인해 주세요.")
    else if (/network|fetch|Failed|timeout|ERR_/i.test(msg)) onError?.("network", msg || "네트워크 오류")
    else if (/secure|https/i.test(msg)) onError?.("unknown", "푸시 알림은 HTTPS 또는 localhost에서만 동작합니다.")
    else onError?.("unknown", msg)
    console.warn("FCM getToken:", e)
    return null
  }
}
