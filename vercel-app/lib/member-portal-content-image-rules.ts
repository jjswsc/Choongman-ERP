export type MemberPortalContentImageRule = {
  label: string
  minWidth: number
  minHeight: number
  aspectW: number
  aspectH: number
}

export const MEMBER_PORTAL_CONTENT_IMAGE_RULES = {
  /** 홈 팝업 배너 — 회원앱 홈 카드 */
  popup: {
    label: '팝업',
    minWidth: 1080,
    minHeight: 1350,
    aspectW: 4,
    aspectH: 5,
  },
  /** 이달의 프로모션 가로 카드 — aspect 16:10 */
  promo: {
    label: '월별 프로모션',
    minWidth: 1280,
    minHeight: 800,
    aspectW: 16,
    aspectH: 10,
  },
  /** 정보·공지 · 상세 시트 */
  info: {
    label: '정보·공지',
    minWidth: 1280,
    minHeight: 800,
    aspectW: 16,
    aspectH: 10,
  },
  login: {
    label: '로그인 배경',
    minWidth: 1080,
    minHeight: 1920,
    aspectW: 9,
    aspectH: 16,
  },
  app: {
    label: '접속 후 배경',
    minWidth: 1080,
    minHeight: 1920,
    aspectW: 9,
    aspectH: 16,
  },
  store_photo: {
    label: '매장 사진',
    minWidth: 1200,
    minHeight: 800,
    aspectW: 3,
    aspectH: 2,
  },
} as const satisfies Record<string, MemberPortalContentImageRule>

export type MemberPortalContentImageRuleKey = keyof typeof MEMBER_PORTAL_CONTENT_IMAGE_RULES

export function resolveMemberPortalContentImageRule(
  variant: 'popup' | 'promo' | 'info'
): MemberPortalContentImageRule {
  if (variant === 'popup') return MEMBER_PORTAL_CONTENT_IMAGE_RULES.popup
  if (variant === 'promo') return MEMBER_PORTAL_CONTENT_IMAGE_RULES.promo
  return MEMBER_PORTAL_CONTENT_IMAGE_RULES.info
}

export function formatMemberPortalContentImageHint(rule: MemberPortalContentImageRule): string {
  return `권장 ${rule.minWidth}×${rule.minHeight}px (${rule.aspectW}:${rule.aspectH}) · JPG/PNG/WebP/GIF · 5MB 이하`
}

export async function readMemberPortalImageSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('이미지 크기를 읽을 수 없습니다.'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function validateMemberPortalImageByRule(
  width: number,
  height: number,
  rule: MemberPortalContentImageRule
): { ok: true } | { ok: false; message: string } {
  if (width < rule.minWidth || height < rule.minHeight) {
    return {
      ok: false,
      message: `${rule.label} 이미지는 최소 ${rule.minWidth}×${rule.minHeight}px 이상이어야 합니다. (현재 ${width}×${height}px)`,
    }
  }
  const actual = width / height
  const expected = rule.aspectW / rule.aspectH
  const ratioDiff = Math.abs(actual - expected)
  if (ratioDiff > expected * 0.02) {
    return {
      ok: false,
      message: `${rule.label} 비율은 ${rule.aspectW}:${rule.aspectH} 이어야 합니다. (현재 ${width}×${height}px)`,
    }
  }
  return { ok: true }
}
