'use client'

/**
 * 네트워크 상태 감지
 */

import { useEffect, useState } from 'react'

export function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

export function useOnlineStatus(callback?: (online: boolean) => void): boolean {
  const [online, setOnline] = useState(() => isOnline())
  useEffect(() => {
    const onOnline = () => {
      setOnline(true)
      callback?.(true)
    }
    const onOffline = () => {
      setOnline(false)
      callback?.(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [callback])
  return online
}
