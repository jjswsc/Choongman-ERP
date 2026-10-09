/**
 * marketing_influencer_profiles 행 ↔ 명부 필드 변환 (서버·클라이언트 공용, 순수)
 */
import {
  isInfluencerPipelineStatus,
  minRateAcross,
  normalizeInstagramHandle,
  normalizeTiktokHandle,
} from './marketing-influencer-profile'
import { emptyInfluencerProfileFields, type InfluencerProfileFields } from './marketing-influencer-sheet-import'

export type MarketingInfluencerProfile = InfluencerProfileFields & {
  id: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

function str(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

function ymdOrNull(v: unknown): string | null {
  const s = str(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export function profileRowToApi(row: Record<string, unknown>): MarketingInfluencerProfile {
  const status = str(row.pipeline_status)
  return {
    id: str(row.id),
    displayName: str(row.display_name),
    contentCategories: Array.isArray(row.content_categories)
      ? (row.content_categories as unknown[]).map(str).filter(Boolean)
      : [],
    tiktokUrl: str(row.tiktok_url),
    tiktokHandle: str(row.tiktok_handle),
    tiktokFollowers: numOrNull(row.tiktok_followers),
    instagramUrl: str(row.instagram_url),
    instagramHandle: str(row.instagram_handle),
    instagramFollowers: numOrNull(row.instagram_followers),
    facebookUrl: str(row.facebook_url),
    facebookFollowers: numOrNull(row.facebook_followers),
    contact: str(row.contact),
    contactName: str(row.contact_name),
    contactPhone: str(row.contact_phone),
    rateTiktok: str(row.rate_tiktok),
    rateInstagram: str(row.rate_instagram),
    rateFacebook: str(row.rate_facebook),
    ratePackage: str(row.rate_package),
    rateMinThb: numOrNull(row.rate_min_thb),
    rateIncludes: str(row.rate_includes),
    extraCost: str(row.extra_cost),
    preferredStore: str(row.preferred_store),
    rateInquiredAt: ymdOrNull(row.rate_inquired_at),
    pipelineStatus: isInfluencerPipelineStatus(status) ? status : 'waiting',
    rateCardUrl: str(row.rate_card_url),
    note: str(row.note),
    createdBy: str(row.created_by),
    createdAt: str(row.created_at),
    updatedAt: str(row.updated_at),
  }
}

/** 클라이언트 입력(부분) → 정규화된 전체 필드. 핸들·최저 레이트는 원문에서 다시 계산 */
export function normalizeProfileInput(input: Partial<Record<keyof InfluencerProfileFields, unknown>>): InfluencerProfileFields {
  const base = emptyInfluencerProfileFields()
  const tiktokUrl = str(input.tiktokUrl)
  const instagramUrl = str(input.instagramUrl)
  const rateTiktok = str(input.rateTiktok)
  const rateInstagram = str(input.rateInstagram)
  const rateFacebook = str(input.rateFacebook)
  const ratePackage = str(input.ratePackage)
  const status = str(input.pipelineStatus)
  const cats = Array.isArray(input.contentCategories)
    ? (input.contentCategories as unknown[]).map(str).filter(Boolean)
    : str(input.contentCategories)
        .split(/[,/]+/)
        .map((x) => x.trim())
        .filter(Boolean)
  const tiktokHandle = normalizeTiktokHandle(str(input.tiktokHandle) || tiktokUrl)
  return {
    ...base,
    displayName: str(input.displayName) || tiktokHandle,
    contentCategories: cats,
    tiktokUrl,
    tiktokHandle,
    tiktokFollowers: numOrNull(input.tiktokFollowers),
    instagramUrl,
    instagramHandle: normalizeInstagramHandle(instagramUrl) || str(input.instagramHandle).replace(/^@/, '').toLowerCase(),
    instagramFollowers: numOrNull(input.instagramFollowers),
    facebookUrl: str(input.facebookUrl),
    facebookFollowers: numOrNull(input.facebookFollowers),
    contact: str(input.contact),
    contactName: str(input.contactName),
    contactPhone: str(input.contactPhone),
    rateTiktok,
    rateInstagram,
    rateFacebook,
    ratePackage,
    rateMinThb: numOrNull(input.rateMinThb) ?? minRateAcross(rateTiktok, rateInstagram, rateFacebook, ratePackage),
    rateIncludes: str(input.rateIncludes),
    extraCost: str(input.extraCost),
    preferredStore: str(input.preferredStore),
    rateInquiredAt: ymdOrNull(input.rateInquiredAt),
    pipelineStatus: isInfluencerPipelineStatus(status) ? status : 'waiting',
    rateCardUrl: str(input.rateCardUrl),
    note: str(input.note),
  }
}

const FIELD_TO_COLUMN: Record<keyof InfluencerProfileFields, string> = {
  displayName: 'display_name',
  contentCategories: 'content_categories',
  tiktokUrl: 'tiktok_url',
  tiktokHandle: 'tiktok_handle',
  tiktokFollowers: 'tiktok_followers',
  instagramUrl: 'instagram_url',
  instagramHandle: 'instagram_handle',
  instagramFollowers: 'instagram_followers',
  facebookUrl: 'facebook_url',
  facebookFollowers: 'facebook_followers',
  contact: 'contact',
  contactName: 'contact_name',
  contactPhone: 'contact_phone',
  rateTiktok: 'rate_tiktok',
  rateInstagram: 'rate_instagram',
  rateFacebook: 'rate_facebook',
  ratePackage: 'rate_package',
  rateMinThb: 'rate_min_thb',
  rateIncludes: 'rate_includes',
  extraCost: 'extra_cost',
  preferredStore: 'preferred_store',
  rateInquiredAt: 'rate_inquired_at',
  pipelineStatus: 'pipeline_status',
  rateCardUrl: 'rate_card_url',
  note: 'note',
}

/** 필드(부분) → DB 컬럼 행 */
export function profileFieldsToRow(fields: Partial<InfluencerProfileFields>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(fields)) {
    const col = FIELD_TO_COLUMN[k as keyof InfluencerProfileFields]
    if (!col || v === undefined) continue
    if (k === 'tiktokFollowers' || k === 'instagramFollowers' || k === 'facebookFollowers') {
      row[col] = v == null ? null : Math.round(Number(v))
    } else {
      row[col] = v
    }
  }
  return row
}
