import { MP_ADMIN_IMAGE_RULE_LABEL_KEYS } from '@/lib/i18n-member-portal-admin'
import type { MemberPortalContentTranslator } from '@/lib/member-portal-content-admin'

export type MemberPortalContentImageRule = {
  label: string
  minWidth: number
  minHeight: number
  aspectW: number
  aspectH: number
  /**
   * 비율 허용 오차(0~1). 미지정 시 기본값(아래 DEFAULT_ASPECT_TOLERANCE_PCT) 사용.
   * 사람이 준비한 이미지는 정확히 맞추기 어려우므로 너무 작게 두면 업로드가 계속 거부된다.
   */
  aspectTolerancePct?: number
  /**
   * 전체화면 `cover` 배경처럼 비율이 의미 없는 경우 비율 검증 자체를 건너뛴다.
   * (요즘 폰은 19.5:9 등 9:16과 다른 비율이라 엄격히 막으면 스크린샷·사진을 못 올린다.)
   */
  skipAspectCheck?: boolean
}

/** 비율 허용 오차 기본값 — 2%는 사람이 준비한 이미지엔 비현실적이라 8%로 완화 */
const DEFAULT_ASPECT_TOLERANCE_PCT = 0.08

export const MEMBER_PORTAL_CONTENT_IMAGE_RULES = {
  /** 홈 팝업 배너 — 회원앱 홈 카드 */
  popup: {
    label: '팝업',
    minWidth: 720,
    minHeight: 900,
    aspectW: 4,
    aspectH: 5,
    skipAspectCheck: true,
  },
  /** 신메뉴 가로 카드 — object-cover */
  new_menu: {
    label: '신메뉴',
    minWidth: 720,
    minHeight: 450,
    aspectW: 16,
    aspectH: 10,
    skipAspectCheck: true,
  },
  /** 이달의 프로모션 가로 카드 */
  promo: {
    label: '월별 프로모션',
    minWidth: 720,
    minHeight: 450,
    aspectW: 16,
    aspectH: 10,
    skipAspectCheck: true,
  },
  info: {
    label: '정보·공지',
    minWidth: 720,
    minHeight: 450,
    aspectW: 16,
    aspectH: 10,
    skipAspectCheck: true,
  },
  login: {
    label: '로그인 배경',
    minWidth: 720,
    minHeight: 1080,
    aspectW: 9,
    aspectH: 16,
    skipAspectCheck: true,
  },
  app: {
    label: '접속 후 배경',
    minWidth: 720,
    minHeight: 1080,
    aspectW: 9,
    aspectH: 16,
    skipAspectCheck: true,
  },
  store_photo: {
    label: '매장 사진',
    minWidth: 720,
    minHeight: 480,
    aspectW: 3,
    aspectH: 2,
    skipAspectCheck: true,
  },
} as const satisfies Record<string, MemberPortalContentImageRule>

export type MemberPortalContentImageRuleKey = keyof typeof MEMBER_PORTAL_CONTENT_IMAGE_RULES

export function resolveMemberPortalContentImageRule(
  variant: 'popup' | 'promo' | 'new_menu' | 'info'
): MemberPortalContentImageRule {
  if (variant === 'popup') return MEMBER_PORTAL_CONTENT_IMAGE_RULES.popup
  if (variant === 'promo') return MEMBER_PORTAL_CONTENT_IMAGE_RULES.promo
  if (variant === 'new_menu') return MEMBER_PORTAL_CONTENT_IMAGE_RULES.new_menu
  return MEMBER_PORTAL_CONTENT_IMAGE_RULES.info
}

export function formatMemberPortalContentImageHint(
  rule: MemberPortalContentImageRule,
  t: MemberPortalContentTranslator
): string {
  let s = t('mpAdmin_imageHint')
  s = s.split('{minW}').join(String(rule.minWidth))
  s = s.split('{minH}').join(String(rule.minHeight))
  s = s.split('{aspectW}').join(String(rule.aspectW))
  s = s.split('{aspectH}').join(String(rule.aspectH))
  return s
}

export function memberPortalImageRuleLabel(
  ruleKey: MemberPortalContentImageRuleKey,
  t: MemberPortalContentTranslator
): string {
  const key = MP_ADMIN_IMAGE_RULE_LABEL_KEYS[ruleKey]
  return key ? t(key) : ruleKey
}

export function memberPortalImageUploadCatchMessage(
  t: MemberPortalContentTranslator,
  e: unknown
): string {
  if (e instanceof Error && e.message === 'IMAGE_SIZE_READ_FAIL') {
    return t('mpAdmin_imageReadSizeFail')
  }
  return t('mpAdmin_errImageUploadGeneric')
}

export async function readMemberPortalImageSize(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('IMAGE_SIZE_READ_FAIL'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function validateMemberPortalImageByRule(
  width: number,
  height: number,
  rule: MemberPortalContentImageRule,
  t: MemberPortalContentTranslator,
  ruleKey: MemberPortalContentImageRuleKey
): { ok: true } | { ok: false; message: string } {
  const label = memberPortalImageRuleLabel(ruleKey, t)
  if (width < rule.minWidth || height < rule.minHeight) {
    let msg = t('mpAdmin_imageTooSmall')
    msg = msg.split('{label}').join(label)
    msg = msg.split('{minW}').join(String(rule.minWidth))
    msg = msg.split('{minH}').join(String(rule.minHeight))
    msg = msg.split('{width}').join(String(width))
    msg = msg.split('{height}').join(String(height))
    return { ok: false, message: msg }
  }
  if (rule.skipAspectCheck) {
    return { ok: true }
  }
  const actual = width / height
  const expected = rule.aspectW / rule.aspectH
  const ratioDiff = Math.abs(actual - expected)
  const tolerancePct = rule.aspectTolerancePct ?? DEFAULT_ASPECT_TOLERANCE_PCT
  if (ratioDiff > expected * tolerancePct) {
    let msg = t('mpAdmin_imageBadRatio')
    msg = msg.split('{label}').join(label)
    msg = msg.split('{aspectW}').join(String(rule.aspectW))
    msg = msg.split('{aspectH}').join(String(rule.aspectH))
    msg = msg.split('{width}').join(String(width))
    msg = msg.split('{height}').join(String(height))
    return { ok: false, message: msg }
  }
  return { ok: true }
}
