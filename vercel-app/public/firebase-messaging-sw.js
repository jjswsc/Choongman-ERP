// Firebase Messaging Service Worker (빌드 시 생성)
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('message', (e) => { if (e.data?.type === 'SKIP_WAITING') self.skipWaiting(); });

importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.0.2/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyCn2w84byUN5EeA-JveKmiwqiwIsE_CP_g",
  authDomain: "cm-erp-63fa8.firebaseapp.com",
  projectId: "cm-erp-63fa8",
  storageBucket: "cm-erp-63fa8.appspot.com",
  messagingSenderId: "675759915232",
  appId: "1:675759915232:web:225e05c4d9c62a6e4f9085",
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
