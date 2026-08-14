'use client'

import { useSyncExternalStore } from 'react'
import {
  isPosMainDeviceSyncOwnedByLayout,
  subscribePosMainDeviceSyncOwner,
} from '@/lib/pos-main-device-sync-owner'

export function usePosMainDeviceSyncOwnedByLayout(): boolean {
  return useSyncExternalStore(
    subscribePosMainDeviceSyncOwner,
    isPosMainDeviceSyncOwnedByLayout,
    () => false
  )
}
