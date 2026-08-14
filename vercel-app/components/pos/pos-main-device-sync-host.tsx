'use client'

import { useLayoutEffect } from 'react'
import { usePathname } from 'next/navigation'
import { usePosMainDeviceSyncHost } from '@/hooks/use-pos-main-device-sync-host'
import { activatePosMainDeviceLayoutSync } from '@/lib/pos-main-device-sync-owner'

function PosMainDeviceSyncHostInner() {
  usePosMainDeviceSyncHost()
  return null
}

/** 메인 POS 백그라운드 동기화(Realtime·폴링·자동인쇄) — /pos/* 전역, 로그인·고객모니터 제외 */
export function PosMainDeviceSyncHost() {
  const pathname = usePathname()
  const skip = pathname === '/pos/login' || pathname === '/pos/customer-display'
  /**
   * 터미널 useEffect(구독)보다 먼저 소유권을 잡는다.
   * useEffect로 켜면 자식 구독이 한 프레임 먼저 붙어 주방 이중 인쇄가 난다.
   */
  useLayoutEffect(() => {
    if (skip) return
    return activatePosMainDeviceLayoutSync()
  }, [skip])
  if (skip) return null
  return <PosMainDeviceSyncHostInner />
}
