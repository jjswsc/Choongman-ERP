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

  it('applies relaxed default aspect tolerance for promo cards', () => {
    const rule = MEMBER_PORTAL_CONTENT_IMAGE_RULES.promo
    const slightlyOff = validateMemberPortalImageByRule(1280, 820, rule, t, 'promo')
    expect(slightlyOff).toEqual({ ok: true })
  })
})
