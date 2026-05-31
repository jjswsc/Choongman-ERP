import type { MemberSummary } from '@/lib/members-server'

export type PortalTab = 'home' | 'order' | 'location' | 'privilege' | 'me'

export type PortalPointRow = {
  id: number
  kind: string
  points: number
  note: string
  createdAt: string
}

export type PortalCouponRow = {
  id: number
  couponCode: string
  status: string
  issuedAt: string
  usedAt?: string
}

export type PortalVisitRow = {
  orderId: number
  orderNo: string
  storeCode: string
  total: number
  visitedAt: string
}

export type PortalDashboard = {
  member: MemberSummary
  referralCode: string
  stats: {
    visitCount: number
    lifetimeAmount: number
    avgTicket: number
    availableCoupons: number
    pointsEarnedTotal: number
  }
  tierProgress: {
    currentTierCode: string
    currentTierName: string
    nextTierCode: string | null
    nextTierName: string | null
    progressPercent: number
    amountToNext: number
    pointRate: number
  }
}

export type PortalProfileForm = {
  name: string
  birthDate: string
  gender: string
  nationality: string
  email: string
  referralCode: string
  consentMarketing: boolean
}

export type TierVisual = {
  label: string
  gradient: string
  accent: string
  chip: string
  glow: string
}

export function buildFallbackDashboard(member: MemberSummary): PortalDashboard {
  const tierCode = String(member.tierCode || 'BRONZE').toUpperCase()
  const lifetimeAmount = Number(member.lifetimeAmount || 0)
  return {
    member,
    referralCode: member.referralCode || '',
    stats: {
      visitCount: 0,
      lifetimeAmount,
      avgTicket: 0,
      availableCoupons: 0,
      pointsEarnedTotal: 0,
    },
    tierProgress: {
      currentTierCode: tierCode,
      currentTierName: tierCode,
      nextTierCode: null,
      nextTierName: null,
      progressPercent: lifetimeAmount > 0 ? 100 : 0,
      amountToNext: 0,
      pointRate: 0.01,
    },
  }
}

export function tierVisual(codeRaw: string): TierVisual {
  const code = String(codeRaw || 'BRONZE').toUpperCase()
  if (code.includes('DIAMOND') || code.includes('VIP') || code.includes('PLATINUM')) {
    return {
      label: code,
      gradient: 'from-[#1a1a2e] via-[#2d2d52] to-[#4a3f6b]',
      accent: 'text-violet-200',
      chip: 'bg-violet-400/20 text-violet-100 border-violet-300/30',
      glow: 'shadow-[0_0_40px_rgba(167,139,250,0.25)]',
    }
  }
  if (code.includes('GOLD')) {
    return {
      label: code,
      gradient: 'from-[#2a1f0d] via-[#4a3612] to-[#7a5c18]',
      accent: 'text-amber-100',
      chip: 'bg-amber-400/20 text-amber-100 border-amber-300/30',
      glow: 'shadow-[0_0_40px_rgba(251,191,36,0.22)]',
    }
  }
  if (code.includes('SILVER')) {
    return {
      label: code,
      gradient: 'from-[#1c1f24] via-[#2b3138] to-[#454d57]',
      accent: 'text-slate-100',
      chip: 'bg-slate-300/15 text-slate-100 border-slate-200/25',
      glow: 'shadow-[0_0_36px_rgba(203,213,225,0.15)]',
    }
  }
  return {
    label: code,
    gradient: 'from-[#1a1208] via-[#3d2a14] to-[#6b4e24]',
    accent: 'text-amber-100',
    chip: 'bg-amber-400/15 text-amber-50 border-amber-300/30',
    glow: 'shadow-[0_0_48px_rgba(212,175,55,0.18)]',
  }
}

export function formatBaht(n: number): string {
  return `฿${Math.round(Number(n || 0)).toLocaleString('en-US')}`
}

export function formatPoints(n: number): string {
  return `${Math.round(Number(n || 0)).toLocaleString('en-US')} P`
}

export function formatDateTime(raw: string, locale = 'th-TH'): string {
  const v = String(raw || '').trim()
  if (!v) return '-'
  const d = new Date(v.includes('T') ? v : v.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return v.slice(0, 16)
  return d.toLocaleString(locale, {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function maskPhone(phone: string): string {
  const digits = String(phone || '').replace(/[^\d]/g, '')
  if (digits.length < 6) return phone || '-'
  return `${digits.slice(0, 3)}•••${digits.slice(-4)}`
}
