'use client'

import { useEffect } from 'react'
import { preRegisterServiceWorker } from '@/lib/firebase-client'

/** 앱 로드 시점에 Service Worker 미리 등록 - 푸시 받기 클릭 시 준비 완료되도록 */
export function SwPreregister() {
  useEffect(() => {
    preRegisterServiceWorker()
  }, [])
  return null
}
