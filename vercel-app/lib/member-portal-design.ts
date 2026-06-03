/** 회원 라운지 기본 배경 — CMS 미설정 시 사용 (모바일 세로 9:16, 상단=히어로 음식) */
export const DEFAULT_MEMBER_APP_BG = '/member-portal/app-bg-premium.jpg'
export const DEFAULT_MEMBER_LOGIN_BG = '/member-portal/app-bg-premium.jpg'

/** 모바일 세로 배경 — cover + 상단 정렬 (치킨 히어로 노출) */
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

export function resolveMemberAppBackgroundUrl(customUrl: string): string {
  const url = String(customUrl || '').trim()
  return url || DEFAULT_MEMBER_APP_BG
}

export function resolveMemberLoginBackgroundUrl(customUrl: string): string {
  const url = String(customUrl || '').trim()
  return url || DEFAULT_MEMBER_LOGIN_BG
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
