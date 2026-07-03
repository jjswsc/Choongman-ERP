let layoutOwnsMainPosDeviceSync = false

/** PosMainDeviceSyncHost 마운트 시 호출 — 터미널 페이지의 중복 Realtime/폴링을 건너뜀 */
export function activatePosMainDeviceLayoutSync(): () => void {
  layoutOwnsMainPosDeviceSync = true
  return () => {
    layoutOwnsMainPosDeviceSync = false
  }
}

export function isPosMainDeviceSyncOwnedByLayout(): boolean {
  return layoutOwnsMainPosDeviceSync
}
