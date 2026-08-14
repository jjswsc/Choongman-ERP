import { describe, expect, it } from 'vitest'
import {
  activatePosMainDeviceLayoutSync,
  isPosMainDeviceSyncOwnedByLayout,
  subscribePosMainDeviceSyncOwner,
} from '@/lib/pos-main-device-sync-owner'

describe('pos-main-device-sync-owner', () => {
  it('notifies subscribers when layout takes and releases sync', () => {
    const seen: boolean[] = []
    const unsub = subscribePosMainDeviceSyncOwner(() => {
      seen.push(isPosMainDeviceSyncOwnedByLayout())
    })
    const release = activatePosMainDeviceLayoutSync()
    expect(isPosMainDeviceSyncOwnedByLayout()).toBe(true)
    release()
    expect(isPosMainDeviceSyncOwnedByLayout()).toBe(false)
    unsub()
    expect(seen).toEqual([true, false])
  })
})
