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

export async function getFcmToken(): Promise<string | null> {
  if (typeof window === "undefined") return null
  if (!isFirebaseConfigured() || !VAPID_KEY) return null

  const supported = await isSupported()
  if (!supported) return null

  const app = getFirebaseApp()
  if (!app) return null

  try {
    const messaging = getMessaging(app)
    const token = await getToken(messaging, { vapidKey: VAPID_KEY })
    return token
  } catch (e) {
    console.warn("FCM getToken:", e)
    return null
  }
}
