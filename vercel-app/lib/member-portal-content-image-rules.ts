import { MP_ADMIN_IMAGE_RULE_LABEL_KEYS } from '@/lib/i18n-member-portal-admin'
import type { MemberPortalContentTranslator } from '@/lib/member-portal-content-admin'

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
  /** 신메뉴 가로 카드 — aspect 16:10 (월별 프로모션과 동일) */
  new_menu: {
    label: '신메뉴',
    minWidth: 1280,
    minHeight: 800,
    aspectW: 16,
    aspectH: 10,
  },
  /** 이달의 프로모션 가로 카드 — aspect 16:10 */
  promo: {
    label: '월별 프로모션',
    minWidth: 1280,
    minHeight: 800,
    aspectW: 16,
    aspectH: 10,
  },
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
  const actual = width / height
  const expected = rule.aspectW / rule.aspectH
  const ratioDiff = Math.abs(actual - expected)
  if (ratioDiff > expected * 0.02) {
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
