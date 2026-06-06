/** 회원 라운지 식당 배경 — CMS 미설정 시 합성 이미지의 하단(인테리어) 사용 */
export const DEFAULT_MEMBER_LOUNGE_BG = '/member-portal/app-bg-premium.jpg'

/** 상단 히어로 음식(접시 크롭) — CMS·POS URL 없을 때 폴백 */
export const DEFAULT_MEMBER_HERO_FOOD = '/member-portal/snow-onion-hero.png'

/** @deprecated 단일 배경 URL — 레거시 호환. 신규는 라운지+히어로 2레이어 */
export const DEFAULT_MEMBER_APP_BG = DEFAULT_MEMBER_LOUNGE_BG
export const DEFAULT_MEMBER_LOGIN_BG = DEFAULT_MEMBER_LOUNGE_BG

/** 모바일 세로 배경 — cover + 상단 정렬 (단일 이미지 CMS 오버라이드용) */
export const MEMBER_PORTAL_BG_STYLE = {
  backgroundSize: 'cover' as const,
  backgroundPosition: 'center top' as const,
  backgroundRepeat: 'no-repeat' as const,
}

export const MP_MAX_WIDTH = 'max-w-[430px]'

/** 멤버십 카드 가로:세로 — 황금비 φ (신용카드형) */
export const MEMBERSHIP_CARD_GOLDEN_RATIO = 1.618033988749895

export const mpGlassCard =
  'rounded-[1.35rem] border border-white/[0.11] bg-[rgba(8,8,10,0.52)] shadow-[0_12px_40px_rgba(0,0,0,0.38)] backdrop-blur-2xl'

export const mpGlassCardSoft =
  'rounded-[1.25rem] border border-white/[0.08] bg-[rgba(12,12,14,0.42)] backdrop-blur-xl'

export const mpGlassInset =
  'rounded-2xl border border-white/[0.07] bg-black/25 backdrop-blur-md'

export const mpInputClass =
  'rounded-2xl border-white/12 bg-black/35 text-white placeholder:text-white/35 focus-visible:border-amber-400/45 focus-visible:ring-amber-400/15'

export const mpPrimaryBtn =
  'h-12 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-[#f5d78e] text-base font-semibold text-[#1a1208] shadow-[0_8px_24px_rgba(212,175,55,0.28)] hover:from-amber-300 hover:to-amber-200'

export const mpGoldText = 'bg-gradient-to-br from-[#fff7e6] via-amber-100 to-amber-300 bg-clip-text text-transparent'

export function resolveMemberPortalLoungeBackgroundUrl(customUrl: string): string {
  const url = String(customUrl || '').trim()
  return url || DEFAULT_MEMBER_LOUNGE_BG
}

export function resolveMemberPortalHeroFoodUrl(customUrl: string): string {
  const url = String(customUrl || '').trim()
  return url || DEFAULT_MEMBER_HERO_FOOD
}

/** 흰 배경 접시 PNG 등 — 식당 탁자 위에 합성할 때 multiply 블렌드 */
export function isMemberPortalIsolatedPlateHero(url: string): boolean {
  const u = String(url || '').trim()
  if (!u || u === DEFAULT_MEMBER_HERO_FOOD) return true
  if (u.includes('snow-onion-hero')) return true
  if (/pos-menu-images/i.test(u)) return false
  return /\.png(?:\?|$)/i.test(u)
}

/** 스노우어니언 접시 — 식당 인테리어 탁자면 위치(뷰포트 기준) */
export const MEMBER_PORTAL_FOOD_ON_TABLE = {
  top: '11%',
  width: 'min(68vw, 286px)',
  rotateXDeg: 7,
  perspectivePx: 960,
} as const

/** CRM 전체 배경 오버라이드 (있을 때만) */
export function resolveMemberAppBackgroundUrl(customUrl: string): string {
  return String(customUrl || '').trim()
}

export function resolveMemberLoginBackgroundUrl(customUrl: string): string {
  return String(customUrl || '').trim()
}

/** 방콕 시간 기준 인사 */
export function memberPortalGreetingKey(): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', hour: 'numeric', hour12: false }).format(
      new Date()
    )
  )
  if (hour >= 5 && hour < 12) return 'greetingMorning'
  if (hour >= 12 && hour < 18) return 'greetingAfternoon'
  return 'greetingEvening'
}
