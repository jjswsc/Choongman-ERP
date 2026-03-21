/**
 * next build 후 public/sw.js 앞에 FCM 백그라운드 핸들러를 붙인다.
 * Serwist 단일 SW + Firebase 푸시 통합. NEXT_PUBLIC_FIREBASE_* 는 빌드/CI 환경변수 사용.
 */
const fs = require("fs")
const path = require("path")

const root = path.join(__dirname, "..")
const swPath = path.join(root, "public", "sw.js")

for (const name of [".env.local", ".env"]) {
  const p = path.join(root, name)
  if (fs.existsSync(p)) {
    fs.readFileSync(p, "utf8")
      .split("\n")
      .forEach((line) => {
        const m = line.match(/^([^#=]+)=(.*)$/)
        if (m) process.env[m[1].trim()] = (m[2].trim() || "").replace(/^["']|["']$/g, "")
      })
    break
  }
}

if (!fs.existsSync(swPath)) {
  console.warn("merge-fcm-into-sw: public/sw.js not found (Serwist disabled or build skipped)")
  process.exit(0)
}

const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ""
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || ""
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ""
const storageBucket = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || ""
const messagingSenderId = process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || ""
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || ""

function esc(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

const fcmPrefix = `// FCM prepended by scripts/merge-fcm-into-sw.cjs (after Serwist build)
self.addEventListener("install", () => { self.skipWaiting(); });
self.addEventListener("message", (e) => { if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });

importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js");

var firebaseConfig = {
  apiKey: "${esc(apiKey)}",
  authDomain: "${esc(authDomain)}",
  projectId: "${esc(projectId)}",
  storageBucket: "${esc(storageBucket)}",
  messagingSenderId: "${esc(messagingSenderId)}",
  appId: "${esc(appId)}",
};

if (typeof firebase !== "undefined" && firebaseConfig.apiKey && firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  var messaging = firebase.messaging();
  messaging.onBackgroundMessage(function (payload) {
    var title = (payload.data && payload.data.title) || (payload.notification && payload.notification.title) || "CM ERP";
    var body = (payload.data && payload.data.body) || (payload.notification && payload.notification.body) || "";
    var tag = (payload.data && payload.data.tag) || ("cm-erp-notice-" + Date.now());
    self.registration.showNotification(title, {
      body: body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: tag,
      data: payload.data || {},
      silent: false,
      vibrate: [200, 100, 200],
      renotify: true,
      requireInteraction: true,
    });
  });
}

`

const body = fs.readFileSync(swPath, "utf8")
fs.writeFileSync(swPath, fcmPrefix + body, "utf8")
console.log("merge-fcm-into-sw: prepended FCM to public/sw.js")
