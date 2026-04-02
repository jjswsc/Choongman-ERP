'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { replacePosOfflineAware } from '@/lib/pos-offline-nav'

/** 로컬 허브 제거 - /pos/local 접근 시 메인 POS로 리다이렉트 */
export default function PosLocalRedirectPage() {
  const router = useRouter()
  useEffect(() => {
    replacePosOfflineAware('/pos', (p) => router.replace(p))
  }, [router])
  return null
}
