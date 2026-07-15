/**
 * 전 매장 손님 영수증 멤버십/포인트 QR 기본값 (O2O 수동 적립 링크).
 * 링크 URL이 있으면 인쇄 시 quickchart로 QR 생성 (업로드 이미지보다 우선).
 */
export const POS_MEMBERSHIP_POINTS_MANUAL_QR_LINK =
  'https://point.o2o.co.th/backend/points/manual/1'

/** DB·설정에 저장할 상대 경로 (배포 origin에 묶이지 않음) */
export const POS_MEMBERSHIP_POINTS_MANUAL_QR_IMAGE_PATH = '/pos/membership-points-manual-qr.png'

export const POS_MEMBERSHIP_POINTS_MANUAL_QR_TEXT_DEFAULT = 'เช็คสิทธิพิเศษที่นี่'

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
