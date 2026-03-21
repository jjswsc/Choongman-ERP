'use client'

import { useEffect } from 'react'

/** 앱 로드 시 `/sw.js` 등록(Serwist+FCM) 및 포그라운드 FCM. 동적 import로 서버 측 Firebase 초기화 방지 */
export function SwPreregister() {
  useEffect(() => {
    import("@/lib/firebase-client").then((m) => {
      m.preRegisterServiceWorker()
      m.setupForegroundHandler()
    }).catch(() => {})
  }, [])
  return null
}
