import type { MemberSummary } from '@/lib/members-server'
import { normalizeMemberBirthDateInput } from '@/lib/member-phone-lookup'

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
  couponName?: string
  discountType?: string
  discountValue?: number
  minOrderAmt?: number
  maxDiscountAmt?: number | null
  validTo?: string
  expiresAt?: string
  stackMode?: string
  campaignId?: number | null
  campaignName?: string
  issuedStoreScope?: string[]
  restoredAt?: string
  restoreReason?: string
  restoredFromOrderId?: number | null
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
    tierQualificationPoints?: number
  }
  tierProgress: {
    currentTierCode: string
    currentTierName: string
    nextTierCode: string | null
    nextTierName: string | null
    progressPercent: number
    amountToNext: number
    pointRate: number
    upgradeBasis?: 'amount' | 'points'
    qualificationValue?: number
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

export function normalizeProfileGender(raw: string): string {
  const v = String(raw || '').trim().toUpperCase()
  if (v === 'M' || v === 'MALE' || v === 'ชาย') return 'M'
  if (v === 'F' || v === 'FEMALE' || v === 'หญิง') return 'F'
  return String(raw || '').trim()
}

/** 회원 DB → 내정보 폼 (수정 모드 프리필) */
export function memberToProfileForm(member: MemberSummary): PortalProfileForm {
  return {
    name: String(member.fullName || member.name || '').trim(),
    birthDate: normalizeMemberBirthDateInput(member.birthDate || ''),
    gender: normalizeProfileGender(member.gender || ''),
    nationality: String(member.nationality || '').trim(),
    email: String(member.email || '').trim(),
    referralCode: '',
    consentMarketing: Boolean(member.consentMarketing),
  }
}

export type { TierFamily, TierVisual } from '@/lib/member-portal-tier-visual'
export { resolveTierFamily, tierVisual } from '@/lib/member-portal-tier-visual'

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
      tierQualificationPoints: Number(member.tierPoints || 0),
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
