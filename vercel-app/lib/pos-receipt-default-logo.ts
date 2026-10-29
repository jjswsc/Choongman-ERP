import { getAppBrandConfigFromEnv, isOmniAppHost } from '@/lib/app-brand'

/**
 * 영수증 로고 미업로드 시 기본 PNG.
 * - 충만: `/company-stamp.png` (CHOONGMAN CHICKEN)
 * - Omni SaaS: 빈 문자열 — 다른 법인(banjoo 등)에 충만 로고가 찍히지 않게 함
 */
export function resolveDefaultReceiptLogoUrl(origin?: string | null): string {
  const base = String(origin || '')
    .trim()
    .replace(/\/$/, '')
  if (!base) return ''

  try {
    const host = new URL(base).hostname
    if (isOmniAppHost(host)) return ''
  } catch {
    /* relative / invalid — fall through to brand check */
  }

  if (getAppBrandConfigFromEnv().key === 'omnifoodtech') return ''

  return `${base}/company-stamp.png`
}

/** 관리자 미리보기 등 origin 없는 상대 경로용 */
export function resolveDefaultReceiptLogoPath(): string {
  if (getAppBrandConfigFromEnv().key === 'omnifoodtech') return ''
  if (typeof window !== 'undefined' && isOmniAppHost(window.location.hostname)) return ''
  return '/company-stamp.png'
}
