import { addBangkokCalendarDays, getBangkokStartOfDayUtcIso, getBangkokTodayDateString } from '@/lib/bangkok-time'

export type MemberPointEarnChannel = 'dine_in' | 'takeout' | 'delivery' | 'member_portal'

export type MemberPointEarnBonusPolicy = {
  channelMultipliers: Record<MemberPointEarnChannel, number>
  birthday: {
    enabled: boolean
    windowDays: number
    multiplier: number
  }
  periodPromo: {
    enabled: boolean
    startDate: string
    endDate: string
    multiplier: number
  }
}

export const MEMBER_POINT_EARN_BONUS_POLICY_KEY = 'member_point_earn_bonus_policy'

export const DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY: MemberPointEarnBonusPolicy = {
  channelMultipliers: {
    dine_in: 1,
    takeout: 1,
    delivery: 1,
    member_portal: 2,
  },
  birthday: {
    enabled: true,
    windowDays: 7,
    multiplier: 2,
  },
  periodPromo: {
    enabled: false,
    startDate: '',
    endDate: '',
    multiplier: 2,
  },
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function clampMultiplier(raw: unknown, fallback = 1): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.round(n * 10000) / 10000
}

function normalizeYmd(raw: unknown): string {
  const s = String(raw ?? '').trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''
}

export function normalizeMemberPointEarnBonusPolicy(raw: unknown): MemberPointEarnBonusPolicy {
  const base = DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY
  if (!raw || typeof raw !== 'object') return { ...base }
  const obj = raw as Record<string, unknown>
  const channelsRaw =
    obj.channelMultipliers && typeof obj.channelMultipliers === 'object'
      ? (obj.channelMultipliers as Record<string, unknown>)
      : {}
  const birthdayRaw =
    obj.birthday && typeof obj.birthday === 'object' ? (obj.birthday as Record<string, unknown>) : {}
  const periodRaw =
    obj.periodPromo && typeof obj.periodPromo === 'object' ? (obj.periodPromo as Record<string, unknown>) : {}

  return {
    channelMultipliers: {
      dine_in: clampMultiplier(channelsRaw.dine_in, base.channelMultipliers.dine_in),
      takeout: clampMultiplier(channelsRaw.takeout, base.channelMultipliers.takeout),
      delivery: clampMultiplier(channelsRaw.delivery, base.channelMultipliers.delivery),
      member_portal: clampMultiplier(channelsRaw.member_portal, base.channelMultipliers.member_portal),
    },
    birthday: {
      enabled: birthdayRaw.enabled !== false,
      windowDays: Math.max(0, Math.min(31, Math.trunc(Number(birthdayRaw.windowDays ?? base.birthday.windowDays)))),
      multiplier: clampMultiplier(birthdayRaw.multiplier, base.birthday.multiplier),
    },
    periodPromo: {
      enabled: periodRaw.enabled === true,
      startDate: normalizeYmd(periodRaw.startDate),
      endDate: normalizeYmd(periodRaw.endDate),
      multiplier: clampMultiplier(periodRaw.multiplier, base.periodPromo.multiplier),
    },
  }
}

export function resolvePointEarnChannel(params: {
  createdBy?: string | null
  orderType?: string | null
}): MemberPointEarnChannel {
  if (String(params.createdBy ?? '').trim().startsWith('member_portal:')) return 'member_portal'
  const ot = String(params.orderType ?? '').trim().toLowerCase()
  if (ot === 'takeout' || ot === 'pickup') return 'takeout'
  if (ot === 'delivery') return 'delivery'
  return 'dine_in'
}

function bangkokDateDiffDays(fromYmd: string, toYmd: string): number {
  const a = Date.parse(getBangkokStartOfDayUtcIso(fromYmd))
  const b = Date.parse(getBangkokStartOfDayUtcIso(toYmd))
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY
  return Math.round((b - a) / 86400000)
}

function resolveBirthdayAnniversaryYmd(year: number, month: number, day: number): string | null {
  let ymd = `${year}-${pad2(month)}-${pad2(day)}`
  if (Number.isNaN(Date.parse(getBangkokStartOfDayUtcIso(ymd)))) {
    if (month === 2 && day === 29) ymd = `${year}-02-28`
    else return null
  }
  return ymd
}

export function isWithinMemberBirthdayBonusWindow(
  birthDate: string | null | undefined,
  todayYmd: string,
  windowDays: number
): boolean {
  const bd = normalizeYmd(birthDate)
  if (!bd) return false
  const wd = Math.max(0, Math.trunc(windowDays))
  if (wd <= 0) return false
  const birthMonth = Number(bd.slice(5, 7))
  const birthDay = Number(bd.slice(8, 10))
  if (!Number.isFinite(birthMonth) || !Number.isFinite(birthDay)) return false

  const todayYear = Number(todayYmd.slice(0, 4))
  if (!Number.isFinite(todayYear)) return false

  for (const year of [todayYear - 1, todayYear, todayYear + 1]) {
    const anniversary = resolveBirthdayAnniversaryYmd(year, birthMonth, birthDay)
    if (!anniversary) continue
    const diff = Math.abs(bangkokDateDiffDays(todayYmd, anniversary))
    if (diff <= wd) return true
  }
  return false
}

export function isWithinPointEarnPeriodPromo(
  todayYmd: string,
  startDate: string,
  endDate: string
): boolean {
  const start = normalizeYmd(startDate)
  const end = normalizeYmd(endDate)
  if (!start || !end || start > end) return false
  return todayYmd >= start && todayYmd <= end
}

export type MemberPointEarnBreakdown = {
  pointEarned: number
  baseEarn: number
  effectiveMultiplier: number
  channel: MemberPointEarnChannel
  channelMultiplier: number
  birthdayApplied: boolean
  periodPromoApplied: boolean
}

/** 중첩 없음: 채널·생일·기간 중 가장 큰 배율 하나만 적용 */
export function computeMemberPointEarn(params: {
  totalAmount: number
  pointRate: number
  policy?: MemberPointEarnBonusPolicy
  channel: MemberPointEarnChannel
  birthDate?: string | null
  todayYmd?: string
}): MemberPointEarnBreakdown {
  const policy = normalizeMemberPointEarnBonusPolicy(params.policy ?? DEFAULT_MEMBER_POINT_EARN_BONUS_POLICY)
  const todayYmd = normalizeYmd(params.todayYmd) || getBangkokTodayDateString()
  const channel = params.channel
  const total = Math.max(0, Number(params.totalAmount || 0))
  const pointRate = Math.max(0, Number(params.pointRate || 0))
  const baseEarn = Math.max(0, Math.floor(total * pointRate))

  const channelMultiplier = Math.max(1, policy.channelMultipliers[channel] || 1)
  const birthdayApplied =
    policy.birthday.enabled &&
    isWithinMemberBirthdayBonusWindow(params.birthDate, todayYmd, policy.birthday.windowDays)
  const periodPromoApplied =
    policy.periodPromo.enabled &&
    isWithinPointEarnPeriodPromo(todayYmd, policy.periodPromo.startDate, policy.periodPromo.endDate)

  const candidates = [channelMultiplier]
  if (birthdayApplied) candidates.push(Math.max(1, policy.birthday.multiplier))
  if (periodPromoApplied) candidates.push(Math.max(1, policy.periodPromo.multiplier))
  const effectiveMultiplier = Math.max(1, ...candidates)
  const pointEarned = Math.max(0, Math.floor(baseEarn * effectiveMultiplier))

  return {
    pointEarned,
    baseEarn,
    effectiveMultiplier,
    channel,
    channelMultiplier,
    birthdayApplied,
    periodPromoApplied,
  }
}

export function formatPointEarnLedgerNote(orderNo: string, breakdown: MemberPointEarnBreakdown): string {
  const base = String(orderNo || '').trim() || 'order_earn'
  if (breakdown.effectiveMultiplier <= 1) return base
  const tags: string[] = [`x${breakdown.effectiveMultiplier}`]
  if (breakdown.birthdayApplied) tags.push('birthday')
  if (breakdown.periodPromoApplied) tags.push('promo')
  if (breakdown.channelMultiplier > 1 && breakdown.channel === 'member_portal') tags.push('portal')
  return `${base}|${tags.join(',')}`
}

/** 테스트·미리보기용: 생일 보너스 구간의 시작·종료(방콕 YYYY-MM-DD) */
export function memberBirthdayBonusWindowRange(
  birthDate: string,
  windowDays: number,
  todayYmd: string
): { start: string; end: string } | null {
  const bd = normalizeYmd(birthDate)
  if (!bd) return null
  const birthMonth = Number(bd.slice(5, 7))
  const birthDay = Number(bd.slice(8, 10))
  const todayYear = Number(todayYmd.slice(0, 4))
  let nearest: string | null = null
  let nearestAbs = Number.POSITIVE_INFINITY
  for (const year of [todayYear - 1, todayYear, todayYear + 1]) {
    const anniversary = resolveBirthdayAnniversaryYmd(year, birthMonth, birthDay)
    if (!anniversary) continue
    const diff = bangkokDateDiffDays(anniversary, todayYmd)
    const abs = Math.abs(diff)
    if (abs < nearestAbs) {
      nearestAbs = abs
      nearest = anniversary
    }
  }
  if (!nearest) return null
  const wd = Math.max(0, Math.trunc(windowDays))
  return {
    start: addBangkokCalendarDays(nearest, -wd),
    end: addBangkokCalendarDays(nearest, wd),
  }
}
