import type { LangCode } from '@/lib/lang-context'

type NationalityLabel = Partial<Record<LangCode, string>> & { en: string; th: string; ko: string }

export type MemberPortalNationalityOption = {
  code: string
  label: NationalityLabel
}

/** 회원앱 국적 선택 — ISO 3166-1 alpha-2 코드 저장 */
export const MEMBER_PORTAL_NATIONALITY_OPTIONS: MemberPortalNationalityOption[] = [
  { code: 'TH', label: { en: 'Thailand', th: 'ไทย', ko: '태국' } },
  { code: 'KR', label: { en: 'South Korea', th: 'เกาหลีใต้', ko: '한국' } },
  { code: 'CN', label: { en: 'China', th: 'จีน', ko: '중국' } },
  { code: 'JP', label: { en: 'Japan', th: 'ญี่ปุ่น', ko: '일본' } },
  { code: 'US', label: { en: 'United States', th: 'สหรัฐอเมริกา', ko: '미국' } },
  { code: 'MY', label: { en: 'Malaysia', th: 'มาเลเซีย', ko: '말레이시아' } },
  { code: 'SG', label: { en: 'Singapore', th: 'สิงคโปร์', ko: '싱가포르' } },
  { code: 'VN', label: { en: 'Vietnam', th: 'เวียดนาม', ko: '베트남' } },
  { code: 'MM', label: { en: 'Myanmar', th: 'เมียนมา', ko: '미얀마' } },
  { code: 'LA', label: { en: 'Laos', th: 'ลาว', ko: '라오스' } },
  { code: 'KH', label: { en: 'Cambodia', th: 'กัมพูชา', ko: '캄보디아' } },
  { code: 'ID', label: { en: 'Indonesia', th: 'อินโดนีเซีย', ko: '인도네시아' } },
  { code: 'PH', label: { en: 'Philippines', th: 'ฟิลิปปินส์', ko: '필리핀' } },
  { code: 'IN', label: { en: 'India', th: 'อินเดีย', ko: '인도' } },
  { code: 'GB', label: { en: 'United Kingdom', th: 'สหราชอาณาจักร', ko: '영국' } },
  { code: 'AU', label: { en: 'Australia', th: 'ออสเตรเลีย', ko: '호주' } },
  { code: 'DE', label: { en: 'Germany', th: 'เยอรมนี', ko: '독일' } },
  { code: 'FR', label: { en: 'France', th: 'ฝรั่งเศส', ko: '프랑스' } },
  { code: 'RU', label: { en: 'Russia', th: 'รัสเซีย', ko: '러시아' } },
  { code: 'OTHER', label: { en: 'Other', th: 'อื่นๆ', ko: '기타' } },
]

const CODE_SET = new Set(MEMBER_PORTAL_NATIONALITY_OPTIONS.map((o) => o.code))

const ALIAS_TO_CODE: Record<string, string> = {
  TH: 'TH',
  THAILAND: 'TH',
  태국: 'TH',
  ไทย: 'TH',
  KR: 'KR',
  KOREA: 'KR',
  'SOUTH KOREA': 'KR',
  한국: 'KR',
  เกาหลี: 'KR',
  CN: 'CN',
  CHINA: 'CN',
  중국: 'CN',
  จีน: 'CN',
  JP: 'JP',
  JAPAN: 'JP',
  일본: 'JP',
  ญี่ปุ่น: 'JP',
  US: 'US',
  USA: 'US',
  'UNITED STATES': 'US',
  미국: 'US',
  OTHER: 'OTHER',
  기타: 'OTHER',
  อื่นๆ: 'OTHER',
}

export function normalizeMemberPortalNationalityCode(raw: string): string {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return ''
  const upper = trimmed.toUpperCase()
  if (CODE_SET.has(upper)) return upper
  return ALIAS_TO_CODE[upper] || ALIAS_TO_CODE[trimmed] || ''
}

export function memberPortalNationalityLabel(lang: LangCode, code: string): string {
  const normalized = normalizeMemberPortalNationalityCode(code) || code
  const opt = MEMBER_PORTAL_NATIONALITY_OPTIONS.find((o) => o.code === normalized)
  if (opt) return opt.label[lang] || opt.label.en
  return code
}

export function isKnownMemberPortalNationalityCode(code: string): boolean {
  return CODE_SET.has(normalizeMemberPortalNationalityCode(code))
}
