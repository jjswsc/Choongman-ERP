import { Capacitor, registerPlugin } from '@capacitor/core'

interface CmNativeAppPlugin {
  ensureCameraPermission(): Promise<{ granted: boolean }>
  openAppSettings(): Promise<void>
}

const CmNativeApp = registerPlugin<CmNativeAppPlugin>('CmNativeApp')

export function isCapacitorAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android'
}

/** Capacitor Android에서만 런타임 카메라 권한 요청. 그 외 환경은 null(웹 getUserMedia에 맡김). */
export async function ensureAndroidCameraPermission(): Promise<boolean | null> {
  if (!isCapacitorAndroid()) return null
  try {
    const res = await CmNativeApp.ensureCameraPermission()
    return !!res.granted
  } catch {
    return false
  }
}

export async function openNativeAppSettings(): Promise<boolean> {
  if (!isCapacitorAndroid()) return false
  try {
    await CmNativeApp.openAppSettings()
    return true
  } catch {
    return false
  }
}
