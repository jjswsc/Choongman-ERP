export type MemberPortalLang = 'ko' | 'en' | 'th'

export type MemberTierDbRow = {
  code?: string
  name?: string
  min_amount?: number
  min_points?: number
  point_rate?: number
  discount_rate?: number | null
  sort_order?: number
  benefits_ko?: string | null
  benefits_en?: string | null
  benefits_th?: string | null
}

export type MemberTierPublic = {
  code: string
  name: string
  minAmount: number
  minPoints: number
  pointRate: number
  discountRate: number
  sortOrder: number
  benefits: string
  pointRangeLabel: string
  spendLabel: string
  isHighest: boolean
}

function toText(v: unknown): string {
  return String(v || '').trim()
}

export function pickTierBenefits(row: MemberTierDbRow, lang: MemberPortalLang): string {
  const ko = toText(row.benefits_ko)
  const en = toText(row.benefits_en)
  const th = toText(row.benefits_th)
  if (lang === 'ko') return ko || en || th
  if (lang === 'th') return th || en || ko
  return en || th || ko
}

export function sortMemberTiers(rows: MemberTierDbRow[]): MemberTierDbRow[] {
  return [...rows].sort((a, b) => {
    const orderDiff = Number(a.sort_order || 0) - Number(b.sort_order || 0)
    if (orderDiff !== 0) return orderDiff
    return Number(a.min_points || 0) - Number(b.min_points || 0)
  })
}

function formatPointRange(min: number, maxExclusive: number | null, lang: MemberPortalLang): string {
  if (maxExclusive == null) {
    if (lang === 'th') return `ตั้งแต่ ${min.toLocaleString('en-US')} ขึ้นไป`
    if (lang === 'ko') return `${min.toLocaleString('en-US')}P 이상`
    return `${min.toLocaleString('en-US')}+ points`
  }
  const max = maxExclusive - 1
  if (lang === 'th') return `ตั้งแต่ ${min.toLocaleString('en-US')} - ${max.toLocaleString('en-US')}`
  if (lang === 'ko') return `${min.toLocaleString('en-US')} - ${max.toLocaleString('en-US')}P`
  return `${min.toLocaleString('en-US')} - ${max.toLocaleString('en-US')} points`
}

function formatSpendThreshold(minAmount: number, lang: MemberPortalLang): string {
  const n = Math.round(Number(minAmount || 0))
  if (n <= 0) {
    if (lang === 'th') return 'สมาชิกระดับพื้นฐาน'
    if (lang === 'ko') return '기본 회원 등급'
    return 'Basic membership level'
  }
  const formatted = n.toLocaleString('en-US')
  if (lang === 'th') return `ยอดสะสม ${formatted} บาทขึ้นไป`
  if (lang === 'ko') return `누적 이용 ${formatted}바트 이상`
  return `Accumulated spend ${formatted} THB or more`
}

export function mapMemberTiersToPublic(rows: MemberTierDbRow[], lang: MemberPortalLang): MemberTierPublic[] {
  const sorted = sortMemberTiers(rows)
  return sorted.map((row, idx) => {
    const minPoints = Math.max(0, Math.trunc(Number(row.min_points || 0)))
    const nextMinPoints =
      idx < sorted.length - 1 ? Math.max(0, Math.trunc(Number(sorted[idx + 1]?.min_points || 0))) : null
    const maxExclusive = nextMinPoints != null && nextMinPoints > minPoints ? nextMinPoints : null
    return {
      code: toText(row.code).toUpperCase() || 'BRONZE',
      name: toText(row.name) || toText(row.code) || 'Bronze',
      minAmount: Math.max(0, Number(row.min_amount || 0)),
      minPoints,
      pointRate: Math.max(0, Number(row.point_rate || 0)),
      discountRate: Math.max(0, Number(row.discount_rate ?? 0)),
      sortOrder: Number(row.sort_order || idx + 1),
      benefits: pickTierBenefits(row, lang),
      pointRangeLabel: formatPointRange(minPoints, maxExclusive, lang),
      spendLabel: formatSpendThreshold(Number(row.min_amount || 0), lang),
      isHighest: idx === sorted.length - 1,
    }
  })
}

export function normalizeMemberTierCode(codeRaw: string): string {
  const code = toText(codeRaw).toUpperCase()
  if (code === 'VIP' || code === 'PLATINUM') return 'DIAMOND'
  return code || 'BRONZE'
}
