/**
 * (레거시) public/firebase-messaging-sw.js 생성용.
 * 운영 PWA는 Serwist `public/sw.js` + scripts/merge-fcm-into-sw.cjs 로 통합됨.
 * 로컬 FCM SW만 단독으로 테스트할 때만 사용.
 */
const fs = require('fs')
const path = require('path')

// .env.local 로드 (Next.js와 동일)
const root = path.join(__dirname, '..')
for (const name of ['.env.local', '.env']) {
  const p = path.join(root, name)
  if (fs.existsSync(p)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach((line) => {
      const m = line.match(/^([^#=]+)=(.*)$/)
      if (m) process.env[m[1].trim()] = (m[2].trim() || '').replace(/^["']|["']$/g, '')
    })
    break
  }
}

const template = `// Firebase Messaging Service Worker (빌드 시 생성)
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
    const tag = payload.data?.tag || ("cm-erp-notice-" + Date.now());
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
      data: payload.data || {},
      silent: false,
      vibrate: [200, 100, 200],
      renotify: true,
      requireInteraction: true,
    });
  });
}
`

const vars = {
  __API_KEY__: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  __AUTH_DOMAIN__: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  __PROJECT_ID__: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  __STORAGE_BUCKET__: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  __MESSAGING_SENDER_ID__: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  __APP_ID__: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
}

let out = template
for (const [k, v] of Object.entries(vars)) {
  out = out.replace(new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), v)
}

const dir = path.join(__dirname, '..', 'public')
const file = path.join(dir, 'firebase-messaging-sw.js')
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(file, out, 'utf8')
console.log('Generated', file)
