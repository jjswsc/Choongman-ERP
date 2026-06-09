import type { I18nKeys } from '@/lib/i18n'

/** 모바일 웹·PWA에서 QR 스캔 카메라 권한 안내 */

export type MobileWebPlatform = 'android' | 'ios' | 'other'

export type WebCameraPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown'

export type CameraSettingsHintKey = Extract<
  I18nKeys,
  | 'attQrScanOpenSettingsHintAndroidPwa'
  | 'attQrScanOpenSettingsHintAndroidBrowser'
  | 'attQrScanOpenSettingsHintIosPwa'
  | 'attQrScanOpenSettingsHintIosBrowser'
  | 'attQrScanOpenSettingsHintGeneric'
>

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as { standalone?: boolean }).standalone) ||
    document.referrer.includes('android-app://')
  )
}

export function getMobileWebPlatform(): MobileWebPlatform {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  if (/Android/i.test(ua)) return 'android'
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  return 'other'
}

export function resolveCameraSettingsHintKey(
  platform: MobileWebPlatform = getMobileWebPlatform(),
  pwa: boolean = isStandalonePwa()
): CameraSettingsHintKey {
  if (platform === 'android') {
    return pwa ? 'attQrScanOpenSettingsHintAndroidPwa' : 'attQrScanOpenSettingsHintAndroidBrowser'
  }
  if (platform === 'ios') {
    return pwa ? 'attQrScanOpenSettingsHintIosPwa' : 'attQrScanOpenSettingsHintIosBrowser'
  }
  return 'attQrScanOpenSettingsHintGeneric'
}

/**
 * Android PWA(홈 화면 CM ERP)는 앱 설정에 카메라 항목이 없음 → Chrome에서 열어 권한 요청.
 * @returns intent 시도 여부
 */
export function tryOpenCurrentUrlInExternalBrowser(): boolean {
  if (typeof window === 'undefined') return false
  const url = window.location.href
  try {
    const parsed = new URL(url)
    if (getMobileWebPlatform() === 'android') {
      const fallback = encodeURIComponent(url)
      const hostPath = `${parsed.host}${parsed.pathname}${parsed.search}`
      const scheme = parsed.protocol.replace(':', '')
      window.location.href = `intent://${hostPath}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${fallback};end`
      return true
    }
  } catch {
    // fall through
  }
  window.open(url, '_blank', 'noopener,noreferrer')
  return true
}

export function shouldOfferOpenInBrowserForCamera(): boolean {
  return getMobileWebPlatform() === 'android' && isStandalonePwa()
}

/** Permissions API 지원 시 카메라 상태 조회 (PWA·모바일 Chrome/Safari) */
export async function queryWebCameraPermission(): Promise<WebCameraPermissionState> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName })
    if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
      return status.state
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}
