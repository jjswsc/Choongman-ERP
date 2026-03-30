/** 협업 관리 화면 전용 세부 정보 — DB marketing_campaigns.collab_detail JSON과 동일 구조 */

export type CollabPartnerType = '' | 'enterprise' | 'school' | 'public' | 'other'

export type MarketingCollabDetail = {
  partnerName: string
  partnerType: CollabPartnerType
  partnerTypeOther: string
  idProofEmployeeCard: boolean
  idProofStudentCard: boolean
  idProofMembership: boolean
  idProofOther: boolean
  idProofNote: string
  scopeChicken: boolean
  scopeKorean: boolean
  scopeSide: boolean
  scopeDrinksNonAlcohol: boolean
  scopeAlcohol: boolean
  scopeTopping: boolean
  scopeNote: string
  /**
   * POS에서 협업 버튼으로 적용할 할인 — 비우면(미설정) POS 목록에 안 나옴.
   * `discountPercentStore`는 구버전 자유 입력 호환용으로 normalize 시 일부 이관됩니다.
   */
  posDiscountType: '' | 'percent' | 'amount'
  posDiscountValue: number
  /** @deprecated 구 자유 입력 — posDiscountType/Value 사용 권장 */
  discountPercentStore: string
  /** 타 할인·쿠폰과 중복 규칙 */
  discountStackingNote: string
  rulesNote: string
  opsFlowNote: string
  contractReference: string
  contactName: string
  contactInfo: string
}

export function emptyMarketingCollabDetail(): MarketingCollabDetail {
  return {
    partnerName: '',
    partnerType: '',
    partnerTypeOther: '',
    idProofEmployeeCard: false,
    idProofStudentCard: false,
    idProofMembership: false,
    idProofOther: false,
    idProofNote: '',
    scopeChicken: false,
    scopeKorean: false,
    scopeSide: false,
    scopeDrinksNonAlcohol: false,
    scopeAlcohol: false,
    scopeTopping: false,
    scopeNote: '',
    posDiscountType: '',
    posDiscountValue: 0,
    discountPercentStore: '',
    discountStackingNote: '',
    rulesNote: '',
    opsFlowNote: '',
    contractReference: '',
    contactName: '',
    contactInfo: '',
  }
}

function asBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1'
}

function asStr(v: unknown): string {
  return v == null ? '' : String(v).trim()
}

function asNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = parseFloat(String(v ?? '').replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : 0
}

const PARTNER_TYPES = new Set(['enterprise', 'school', 'public', 'other'])
const POS_DISCOUNT_TYPES = new Set(['percent', 'amount'])

export function normalizeMarketingCollabDetail(raw: unknown): MarketingCollabDetail {
  const e = emptyMarketingCollabDetail()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return e
  const o = raw as Record<string, unknown>
  const scope =
    o.scope && typeof o.scope === 'object' && !Array.isArray(o.scope)
      ? (o.scope as Record<string, unknown>)
      : null

  e.partnerName = asStr(o.partnerName)
  const pt = asStr(o.partnerType)
  e.partnerType = PARTNER_TYPES.has(pt) ? (pt as CollabPartnerType) : ''
  e.partnerTypeOther = asStr(o.partnerTypeOther)
  e.idProofEmployeeCard = asBool(o.idProofEmployeeCard)
  e.idProofStudentCard = asBool(o.idProofStudentCard)
  e.idProofMembership = asBool(o.idProofMembership)
  e.idProofOther = asBool(o.idProofOther)
  e.idProofNote = asStr(o.idProofNote)
  e.scopeChicken = asBool(scope?.chicken ?? o.scopeChicken)
  e.scopeKorean = asBool(scope?.korean ?? o.scopeKorean)
  e.scopeSide = asBool(scope?.side ?? o.scopeSide)
  e.scopeDrinksNonAlcohol = asBool(scope?.drinksNonAlcohol ?? o.scopeDrinksNonAlcohol)
  e.scopeAlcohol = asBool(scope?.alcohol ?? o.scopeAlcohol)
  e.scopeTopping = asBool(scope?.topping ?? o.scopeTopping)
  e.scopeNote = asStr(o.scopeNote)
  const pdt = asStr(o.posDiscountType)
  e.posDiscountType = POS_DISCOUNT_TYPES.has(pdt) ? (pdt as MarketingCollabDetail['posDiscountType']) : ''
  e.posDiscountValue = Math.max(0, asNum(o.posDiscountValue))
  e.discountPercentStore = asStr(o.discountPercentStore)
  if (!e.posDiscountType && e.posDiscountValue <= 0 && e.discountPercentStore) {
    const m = e.discountPercentStore.match(/(\d+(?:\.\d+)?)/)
    if (m) {
      e.posDiscountType = 'percent'
      e.posDiscountValue = Math.min(100, Math.max(0, parseFloat(m[1]) || 0))
    }
  }
  e.discountStackingNote = asStr(o.discountStackingNote)
  e.rulesNote = asStr(o.rulesNote)
  e.opsFlowNote = asStr(o.opsFlowNote)
  e.contractReference = asStr(o.contractReference)
  e.contactName = asStr(o.contactName)
  e.contactInfo = asStr(o.contactInfo)
  return e
}

/** API 저장용 — 중첩 scope 없이 평탄한 JSON (호환용 scope 블록도 함께 넣음) */
export function collabDetailToJson(d: MarketingCollabDetail): Record<string, unknown> {
  return {
    partnerName: d.partnerName,
    partnerType: d.partnerType,
    partnerTypeOther: d.partnerTypeOther,
    idProofEmployeeCard: d.idProofEmployeeCard,
    idProofStudentCard: d.idProofStudentCard,
    idProofMembership: d.idProofMembership,
    idProofOther: d.idProofOther,
    idProofNote: d.idProofNote,
    scopeChicken: d.scopeChicken,
    scopeKorean: d.scopeKorean,
    scopeSide: d.scopeSide,
    scopeDrinksNonAlcohol: d.scopeDrinksNonAlcohol,
    scopeAlcohol: d.scopeAlcohol,
    scopeTopping: d.scopeTopping,
    scope: {
      chicken: d.scopeChicken,
      korean: d.scopeKorean,
      side: d.scopeSide,
      drinksNonAlcohol: d.scopeDrinksNonAlcohol,
      alcohol: d.scopeAlcohol,
      topping: d.scopeTopping,
    },
    scopeNote: d.scopeNote,
    posDiscountType: d.posDiscountType,
    posDiscountValue: d.posDiscountValue,
    discountPercentStore: d.discountPercentStore,
    discountStackingNote: d.discountStackingNote,
    rulesNote: d.rulesNote,
    opsFlowNote: d.opsFlowNote,
    contractReference: d.contractReference,
    contactName: d.contactName,
    contactInfo: d.contactInfo,
  }
}
