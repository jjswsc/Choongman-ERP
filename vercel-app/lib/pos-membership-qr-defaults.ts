/**
 * 전 매장 손님 영수증 멤버십 QR 기본값 — 회원 포털 가입/로그인(`/m`).
 * DB에는 상대 경로 `/m`을 저장하고, 인쇄·미리보기 시 배포 origin을 붙여 절대 URL QR을 만든다.
 * (choongman / Omni / 커스텀 도메인 공통)
 */
export const POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK = '/m'

/** DB·설정에 저장할 상대 경로 (배포 origin에 묶이지 않음) */
export const POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH = '/pos/membership-points-manual-qr.png'

export const POS_MEMBERSHIP_POINTS_MANUAL_QR_TEXT_DEFAULT = 'เช็คสิทธิพิเศษที่นี่'

/** 예전 O2O 수동적립 호스트 — DNS 없음. 링크 필드가 남아 있으면 이미지도 무시되고 실패함 */
const DEAD_O2O_MEMBERSHIP_QR_HOST_RE = /point\.o2o\.co\.th/i

/** 죽은 O2O 링크·빈 값 정리 후 저장/인쇄용 링크 후보 */
export function coerceMembershipQrLinkUrl(raw: string | null | undefined): string {
  const u = String(raw ?? '').trim()
  if (!u) return ''
  if (DEAD_O2O_MEMBERSHIP_QR_HOST_RE.test(u)) return POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK
  return u
}

/** 상대 경로·data URL을 인쇄 HTML에서 쓸 수 있게 origin 붙여 절대 URL로 */
export function resolveReceiptAssetUrl(url: string, origin: string): string {
  const u = String(url || '').trim()
  if (!u) return ''
  if (/^(https?:|data:|blob:)/i.test(u)) return u
  if (u.startsWith('/')) {
    const base = String(origin || '').replace(/\/$/, '')
    return base ? `${base}${u}` : u
  }
  return u
}

/** QR에 넣을 가입 링크 — 죽은 O2O는 /m, 절대·상대 `/m`은 현재 origin으로 재해석 */
export function resolveMembershipQrLinkUrl(link: string, origin: string): string {
  const coerced = coerceMembershipQrLinkUrl(link)
  if (!coerced) return ''
  const base = String(origin || '').replace(/\/$/, '')
  const isPortalPath = (pathname: string) => pathname === '/m' || pathname === '/m/'
  if (coerced === '/m' || coerced === '/m/') {
    return base ? `${base}/m` : ''
  }
  if (/^https?:\/\//i.test(coerced)) {
    try {
      const parsed = new URL(coerced)
      if (isPortalPath(parsed.pathname)) {
        return base ? `${base}/m` : ''
      }
    } catch {
      /* fall through */
    }
  }
  return resolveReceiptAssetUrl(coerced, origin)
}

/** 미리보기용 — DB 저장값으로 쓰지 말 것 */
export function absoluteMembershipQrImageUrl(origin: string): string {
  return resolveReceiptAssetUrl(POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH, origin)
}

/** 일괄 적용 시 저장용 이미지 URL 정규화 (localhost·프리뷰 origin 절대 URL 제거) */
export function normalizeMembershipQrImageUrlForStorage(raw: string | null | undefined): string {
  const u = String(raw ?? '').trim()
  if (!u) return POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH
  if (u.startsWith('data:')) return u
  if (u.startsWith('/')) return u
  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u)
      const isLocalOrPreview =
        /localhost|127\.0\.0\.1/i.test(parsed.hostname) || /\.vercel\.app$/i.test(parsed.hostname)
      if (parsed.pathname.endsWith(POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH) || isLocalOrPreview) {
        return POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH
      }
      return u
    } catch {
      return POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH
    }
  }
  return POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH
}

/** 가입 링크 저장 정규화 — /m 또는 동일 경로의 vercel 절대 URL은 상대 `/m`으로. 죽은 O2O도 /m */
export function normalizeMembershipQrLinkUrlForStorage(raw: string | null | undefined): string {
  const coerced = coerceMembershipQrLinkUrl(raw)
  const u = coerced || POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK
  if (u === '/m' || u === '/m/') return POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK
  if (/^https?:\/\//i.test(u)) {
    try {
      const parsed = new URL(u)
      if (parsed.pathname === '/m' || parsed.pathname === '/m/') {
        return POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK
      }
      return u
    } catch {
      return POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK
    }
  }
  if (u.startsWith('/')) return u
  return u
}
