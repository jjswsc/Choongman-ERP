/**
 * Firebase Messaging Service Worker - env 변수 주입하여 반환
 * /firebase-messaging-sw.js 로 요청 시 rewrites로 이 route 호출
 */
import { NextResponse } from "next/server"

const SW_TEMPLATE = `// 새 버전 즉시 활성화 (waiting 상태 해소)
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });

importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "__API_KEY__",
  authDomain: "__AUTH_DOMAIN__",
  projectId: "__PROJECT_ID__",
  storageBucket: "__STORAGE_BUCKET__",
  messagingSenderId: "__MESSAGING_SENDER_ID__",
  appId: "__APP_ID__",
};

if (firebaseConfig.apiKey && firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const title = payload.data?.title || payload.notification?.title || "CM ERP";
    const body = payload.data?.body || payload.notification?.body || "";
    const options = {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.data?.tag || "cm-erp-notice",
      data: payload.data || {},
      silent: false,
      vibrate: [200, 100, 200],
      renotify: true,
    };
    self.registration.showNotification(title, options);
  });
}
`

export async function GET() {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ""
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || ""
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ""
  const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || ""
  const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || ""
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || ""

  const body = SW_TEMPLATE
    .replace("__API_KEY__", apiKey)
    .replace("__AUTH_DOMAIN__", authDomain)
    .replace("__PROJECT_ID__", projectId)
    .replace("__STORAGE_BUCKET__", storageBucket)
    .replace("__MESSAGING_SENDER_ID__", messagingSenderId)
    .replace("__APP_ID__", appId)

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/javascript",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    },
  })
}
