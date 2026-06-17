import { describe, expect, it } from 'vitest'
import {
  MEMBER_PORTAL_CONTENT_IMAGE_RULES,
  validateMemberPortalImageByRule,
} from '@/lib/member-portal-content-image-rules'

const t = (key: string) => key

describe('validateMemberPortalImageByRule', () => {
  it('skips aspect ratio check for login/app backgrounds (phone screenshots)', () => {
    const rule = MEMBER_PORTAL_CONTENT_IMAGE_RULES.login
    const widePhone = validateMemberPortalImageByRule(1170, 2532, rule, t, 'login')
    expect(widePhone).toEqual({ ok: true })
  })

  it('still enforces minimum size for backgrounds', () => {
    const rule = MEMBER_PORTAL_CONTENT_IMAGE_RULES.app
    const tooSmall = validateMemberPortalImageByRule(640, 480, rule, t, 'app')
    expect(tooSmall.ok).toBe(false)
  })

  it('accepts typical phone photos for promo cards', () => {
    const rule = MEMBER_PORTAL_CONTENT_IMAGE_RULES.promo
    const phone = validateMemberPortalImageByRule(1170, 2532, rule, t, 'promo')
    expect(phone).toEqual({ ok: true })
  })

  it('accepts square promo images', () => {
    const rule = MEMBER_PORTAL_CONTENT_IMAGE_RULES.promo
    const square = validateMemberPortalImageByRule(1080, 1080, rule, t, 'promo')
    expect(square).toEqual({ ok: true })
  })
})
