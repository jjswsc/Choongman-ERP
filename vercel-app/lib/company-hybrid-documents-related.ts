import {
  COMPANY_HYBRID_RELATED_TYPES,
  isCompanyHybridRelatedType,
  type CompanyHybridRelatedType,
} from '@/lib/company-hybrid-documents'

export type CompanyHybridDocRelatedPayload = {
  related_type: CompanyHybridRelatedType
  related_id: string | null
}

function normRelatedId(raw: unknown): string | null {
  const s = String(raw ?? '').trim()
  return s.length > 0 ? s.slice(0, 120) : null
}

/** 저장 API body → related_type / related_id */
export function parseCompanyHybridDocRelatedFromBody(body: Record<string, unknown>): CompanyHybridDocRelatedPayload {
  const typeRaw = String(body.relatedType ?? body.related_type ?? 'none').trim().toLowerCase()
  const relatedType: CompanyHybridRelatedType = isCompanyHybridRelatedType(typeRaw) ? typeRaw : 'none'
  const relatedId = normRelatedId(body.relatedId ?? body.related_id)
  if (relatedType === 'none') {
    return { related_type: 'none', related_id: null }
  }
  if (!relatedId) {
    return { related_type: 'none', related_id: null }
  }
  return { related_type: relatedType, related_id: relatedId }
}

export function labelCompanyHybridRelatedType(
  type: string,
  t: (key: string) => string
): string {
  if (type === 'employee') return t('companyHybridDocRelatedEmployee')
  if (type === 'store') return t('companyHybridDocRelatedStore')
  if (type === 'interior_project') return t('companyHybridDocRelatedInterior')
  return t('companyHybridDocRelatedNone')
}

export { COMPANY_HYBRID_RELATED_TYPES }
