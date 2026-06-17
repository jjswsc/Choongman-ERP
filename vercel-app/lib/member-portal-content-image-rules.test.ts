import { describe, expect, it } from 'vitest'
import {
  MEMBER_PORTAL_CONTENT_IMAGE_RULES,
  validateMemberPortalImageByRule,
} from '@/lib/member-portal-content-image-rules'
import {
  MP_HOME_HERO_ASPECT_H,
  MP_HOME_HERO_ASPECT_W,
  MP_HOME_HERO_MIN_HEIGHT,
  MP_HOME_HERO_MIN_WIDTH,
} from '@/lib/member-portal-home-layout'

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

  it('accepts hero banner promo images at 12:5', () => {
    const rule = MEMBER_PORTAL_CONTENT_IMAGE_RULES.promo
    expect(rule.aspectW).toBe(MP_HOME_HERO_ASPECT_W)
    expect(rule.minWidth).toBe(MP_HOME_HERO_MIN_WIDTH)
    const hero = validateMemberPortalImageByRule(1200, 500, rule, t, 'promo')
    expect(hero).toEqual({ ok: true })
  })

  it('rejects portrait phone photos for promo hero', () => {
    const rule = MEMBER_PORTAL_CONTENT_IMAGE_RULES.promo
    const phone = validateMemberPortalImageByRule(1170, 2532, rule, t, 'promo')
    expect(phone.ok).toBe(false)
  })

  it('accepts square new menu images', () => {
    const rule = MEMBER_PORTAL_CONTENT_IMAGE_RULES.new_menu
    const square = validateMemberPortalImageByRule(1080, 1080, rule, t, 'new_menu')
    expect(square).toEqual({ ok: true })
  })

  it('rejects undersized promo hero images', () => {
    const rule = MEMBER_PORTAL_CONTENT_IMAGE_RULES.promo
    const small = validateMemberPortalImageByRule(800, 400, rule, t, 'promo')
    expect(small.ok).toBe(false)
    expect(small.ok === false && small.message).toContain('mpAdmin_imageTooSmall')
  })

  it('promo min height matches home layout constant', () => {
    expect(MEMBER_PORTAL_CONTENT_IMAGE_RULES.promo.minHeight).toBe(MP_HOME_HERO_MIN_HEIGHT)
    expect(MEMBER_PORTAL_CONTENT_IMAGE_RULES.promo.aspectH).toBe(MP_HOME_HERO_ASPECT_H)
  })
})
