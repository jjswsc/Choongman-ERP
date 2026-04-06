"use client"

import { isCmPosHybridShell } from "@/lib/cm-pos-shell"
import { getApps, initializeApp, getApp, type FirebaseApp } from "firebase/app"
import { getMessaging, getToken, isSupported, onMessage } from "firebase/messaging"

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

const VAPID_KEY = (process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || '').trim()

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

/**
 * PWA + FCM 통합 Service Worker (`/sw.js`, Serwist 빌드 + postbuild FCM 주입).
 * Firebase 미설정이어도 등록하여 오프라인 셸이 동작하도록 함.
 */
export function preRegisterServiceWorker(): void {
  if (typeof window === "undefined" || !navigator?.serviceWorker?.register) return
  // Local dev + HMR에서 SW 캐시가 _next 청크를 오염시키면 ChunkLoadError/SyntaxError가 반복된다.
  if (process.env.NODE_ENV !== "production") return
  /**
   * Windows Electron 하이브리드: Serwist가 Supabase 등 교차 출처 `<img>` GET을 처리할 때
   * 데스크톱 Chromium에서만 썸네일이 비는 사례가 있음(브라우저 탭은 정상).
   * POS 셸은 IndexedDB·직접 fetch로 오프라인 보조를 쓰므로 SW 없이 동작하게 한다.
   */
  if (isCmPosHybridShell()) return
  navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {})
}

/** 앱이 포그라운드(열려 있을 때)일 때 FCM 메시지 수신 → 알림 표시. 백그라운드는 Service Worker가 처리 */
export function setupForegroundHandler(): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") return
  if (!isFirebaseConfigured()) return
  if (Notification.permission !== "granted") return

  const app = getFirebaseApp()
  if (!app) return

  try {
    const messaging = getMessaging(app)
    onMessage(messaging, (payload) => {
      const title = payload.data?.title || (payload as { notification?: { title?: string } }).notification?.title || "CM ERP"
      const body = payload.data?.body || (payload as { notification?: { body?: string } }).notification?.body || ""
      const tag = payload.data?.tag || `cm-erp-notice-${Date.now()}`
      const opts = {
        body,
        icon: "/icon-192.png",
        tag,
        silent: false,
        vibrate: [200, 100, 200],
        renotify: true,
        requireInteraction: true,
      } as NotificationOptions
      new Notification(title, opts)
    })
  } catch {
    // getMessaging 실패 시 (SSR 등) 무시
  }
}

/** 기존 Service Worker 전부 해제 (캐시된 이전 SW로 인한 실패 시, 해제 후 페이지 새로고침 필요) */
export async function unregisterServiceWorkers(): Promise<void> {
  if (typeof window === "undefined" || !navigator?.serviceWorker?.getRegistrations) return
  const regs = await navigator.serviceWorker.getRegistrations()
  for (const reg of regs) {
    await reg.unregister()
  }
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
    const messaging = getMessaging(app)
    let swReg: ServiceWorkerRegistration | undefined
    try {
      swReg = (await navigator.serviceWorker.getRegistration()) || undefined
    } catch {
      swReg = undefined
    }
    const maxRetries = 4
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 5000 * attempt))
        const token = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          ...(swReg ? { serviceWorkerRegistration: swReg } : {}),
        })
        return token
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        const isRetryable = /subscribing|subscribe|Subscription failed|no active Service Worker|Service Worker/i.test(msg)
        if (isRetryable && attempt < maxRetries - 1) continue
        throw e
      }
    }
    return null
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/permission|denied/i.test(msg)) onError?.("permission", msg)
    else if (/push service not available|Registration failed/i.test(msg))
      onError?.("webview", msg)
    else if (/subscribing|subscribe|Subscription failed|no active Service Worker|Service Worker/i.test(msg))
      onError?.("unknown", msg)
    else if (/service worker|registration|firebase-messaging-sw|unable to register/i.test(msg))
      onError?.("unknown", msg)
    else if (/network|fetch|Failed|timeout|ERR_/i.test(msg)) onError?.("network", msg || "네트워크 오류")
    else if (/secure|https/i.test(msg)) onError?.("unknown", msg)
    else onError?.("unknown", msg)
    console.warn("FCM getToken:", e)
    return null
  }
}
