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

/** 페이지 배경·본문 텍스트 — 화사한 웜 라이트 톤 */
export const MP_PAGE_BG = '#faf7f2'
export const MP_PAGE_BG_CLASS = 'bg-[#faf7f2]'
export const MP_TEXT_PRIMARY = 'text-stone-900'
export const MP_TEXT_SECONDARY = 'text-stone-600'
export const MP_TEXT_MUTED = 'text-stone-500'
export const MP_TEXT_SUBTLE = 'text-stone-400'

/** 하단 탭 네비 고정 시 본문·플로팅 버튼 여백 (safe-area 포함) */
export const MP_BOTTOM_NAV_CLEARANCE =
  'calc(5.25rem + env(safe-area-inset-bottom, 0px))'

/** CRM iframe 미리보기 — 스크롤 없이 상단 홈 구역 노출 */
export const MP_EMBED_PREVIEW_BOTTOM_CLEARANCE = 'calc(4.75rem + env(safe-area-inset-bottom, 0px))'

/** 멤버십 카드 가로:세로 — 황금비 φ (신용카드형) */
export const MEMBERSHIP_CARD_GOLDEN_RATIO = 1.618033988749895

export const mpGlassCard =
  'rounded-[1.35rem] border border-amber-900/[0.08] bg-white/95 shadow-[0_8px_32px_rgba(28,21,16,0.07)] backdrop-blur-md'

export const mpGlassCardSoft =
  'rounded-[1.25rem] border border-stone-200/80 bg-white/88 shadow-[0_4px_20px_rgba(28,21,16,0.05)] backdrop-blur-sm'

export const mpGlassInset =
  'rounded-2xl border border-stone-200/70 bg-stone-50/90 backdrop-blur-sm'

export const mpInputClass =
  'rounded-2xl border-stone-200 bg-white text-stone-900 placeholder:text-stone-400 shadow-sm focus-visible:border-amber-500/50 focus-visible:ring-amber-400/20'

export const mpPrimaryBtn =
  'h-12 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-300 to-[#f5d78e] text-base font-semibold text-[#1a1208] shadow-[0_8px_24px_rgba(212,175,55,0.28)] hover:from-amber-300 hover:to-amber-200'

export const mpGoldText =
  'bg-gradient-to-br from-[#8b6914] via-amber-700 to-amber-500 bg-clip-text text-transparent'

/** 어두운 멤버십 카드 위 골드 타이틀 */
export const mpGoldTextOnDark =
  'bg-gradient-to-br from-[#fff7e6] via-amber-100 to-amber-300 bg-clip-text text-transparent'

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
