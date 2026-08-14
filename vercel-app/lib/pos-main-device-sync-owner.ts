'use client'

let layoutOwnsMainPosDeviceSync = false
const listeners = new Set<() => void>()

function emitPosMainDeviceSyncOwnerChange(): void {
  for (const listener of listeners) listener()
}

/** PosMainDeviceSyncHost 마운트 시 호출 — 터미널 페이지의 중복 Realtime/폴링을 건너뜀 */
export function activatePosMainDeviceLayoutSync(): () => void {
  layoutOwnsMainPosDeviceSync = true
  emitPosMainDeviceSyncOwnerChange()
  return () => {
    layoutOwnsMainPosDeviceSync = false
    emitPosMainDeviceSyncOwnerChange()
  }
}

export function isPosMainDeviceSyncOwnedByLayout(): boolean {
  return layoutOwnsMainPosDeviceSync
}

export function subscribePosMainDeviceSyncOwner(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}
