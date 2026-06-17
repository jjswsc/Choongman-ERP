import {
  MP_HOME_HERO_ASPECT_H,
  MP_HOME_HERO_ASPECT_W,
  MP_HOME_HERO_MIN_HEIGHT,
  MP_HOME_HERO_MIN_WIDTH,
  MP_HOME_POPUP_ASPECT_H,
  MP_HOME_POPUP_ASPECT_W,
  MP_HOME_POPUP_MIN_HEIGHT,
  MP_HOME_POPUP_MIN_WIDTH,
} from '@/lib/member-portal-home-layout'
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
   */
  aspectTolerancePct?: number
  /** 전체화면 cover·폰 스크린샷 등 비율 검증 생략 */
  skipAspectCheck?: boolean
  /** 관리자 업로드 안내용 구도 힌트 i18n 키 */
  compositionHintKey?: string
}

const DEFAULT_ASPECT_TOLERANCE_PCT = 0.08
const PROMO_ASPECT_TOLERANCE_PCT = 0.12

export const MEMBER_PORTAL_CONTENT_IMAGE_RULES = {
  popup: {
    label: '팝업',
    minWidth: MP_HOME_POPUP_MIN_WIDTH,
    minHeight: MP_HOME_POPUP_MIN_HEIGHT,
    aspectW: MP_HOME_POPUP_ASPECT_W,
    aspectH: MP_HOME_POPUP_ASPECT_H,
    skipAspectCheck: true,
    compositionHintKey: 'mpAdmin_imageCompositionPopup',
  },
  new_menu: {
    label: '신메뉴',
    minWidth: MP_HOME_HERO_MIN_WIDTH,
    minHeight: MP_HOME_HERO_MIN_HEIGHT,
    aspectW: MP_HOME_HERO_ASPECT_W,
    aspectH: MP_HOME_HERO_ASPECT_H,
    aspectTolerancePct: PROMO_ASPECT_TOLERANCE_PCT,
    compositionHintKey: 'mpAdmin_imageCompositionNewMenu',
  },
  promo: {
    label: '월별 프로모션',
    minWidth: MP_HOME_HERO_MIN_WIDTH,
    minHeight: MP_HOME_HERO_MIN_HEIGHT,
    aspectW: MP_HOME_HERO_ASPECT_W,
    aspectH: MP_HOME_HERO_ASPECT_H,
    aspectTolerancePct: PROMO_ASPECT_TOLERANCE_PCT,
    compositionHintKey: 'mpAdmin_imageCompositionPromo',
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

export function formatMemberPortalContentImageCompositionHint(
  rule: MemberPortalContentImageRule,
  t: MemberPortalContentTranslator
): string | null {
  if (!rule.compositionHintKey) return null
  return t(rule.compositionHintKey)
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
