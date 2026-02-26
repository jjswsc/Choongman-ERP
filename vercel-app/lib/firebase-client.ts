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
    const token = await getToken(messaging, { vapidKey: VAPID_KEY })
    return token
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/permission|denied/i.test(msg)) onError?.("permission", msg)
    else if (/push service not available|Registration failed/i.test(msg))
      onError?.("webview", "Chrome 앱을 열고 주소를 직접 입력해 접속한 뒤 시도하세요. (앱 내 브라우저·Safari·구버전 X)")
    else if (/network|fetch|Failed|timeout|ERR_/i.test(msg)) onError?.("network", msg || "네트워크 오류")
    else if (/service worker|firebase-messaging-sw|secure|https/i.test(msg)) onError?.("unknown", "HTTPS 또는 localhost에서 접속해 주세요.")
    else onError?.("unknown", msg)
    console.warn("FCM getToken:", e)
    return null
  }
}
