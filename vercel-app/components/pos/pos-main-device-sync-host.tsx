'use client'

import { usePathname } from 'next/navigation'
import { usePosMainDeviceSyncHost } from '@/hooks/use-pos-main-device-sync-host'

function PosMainDeviceSyncHostInner() {
  usePosMainDeviceSyncHost()
  return null
}

/** 메인 POS 백그라운드 동기화(Realtime·폴링·자동인쇄) — /pos/* 전역, 로그인·고객모니터 제외 */
export function PosMainDeviceSyncHost() {
  const pathname = usePathname()
  if (pathname === '/pos/login' || pathname === '/pos/customer-display') {
    return null
  }
  return <PosMainDeviceSyncHostInner />
}
