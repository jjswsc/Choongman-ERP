'use client'

import { useEffect } from 'react'

/** 앱 로드 시점에 Service Worker 미리 등록 - 푸시 받기 클릭 시 준비 완료되도록. 동적 import로 서버 측 Firebase 초기화 방지 */
export function SwPreregister() {
  useEffect(() => {
    import('@/lib/firebase-client').then((m) => {
      m.preRegisterServiceWorker()
      m.setupForegroundHandler()
    }).catch(() => {})
  }, [])
  return null
}
