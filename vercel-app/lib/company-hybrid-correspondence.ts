/**
 * 문서 관리(company_hybrid_documents.metadata.correspondence) — 공문 등 구조화 필드
 */

export const COMPANY_HYBRID_CORRESPONDENCE_DIRECTIONS = ['outbound', 'inbound'] as const
export type CompanyHybridCorrespondenceDirection = (typeof COMPANY_HYBRID_CORRESPONDENCE_DIRECTIONS)[number]

export const COMPANY_HYBRID_CORRESPONDENCE_STATUSES = ['draft', 'sent', 'filed', 'replied'] as const
export type CompanyHybridCorrespondenceStatus = (typeof COMPANY_HYBRID_CORRESPONDENCE_STATUSES)[number]

export const COMPANY_HYBRID_CORRESPONDENCE_CHANNELS = ['mail', 'email', 'visit', 'other'] as const
export type CompanyHybridCorrespondenceChannel = (typeof COMPANY_HYBRID_CORRESPONDENCE_CHANNELS)[number]

export type CompanyHybridCorrespondence = {
  direction?: CompanyHybridCorrespondenceDirection
  counterparty?: string
  officialRef?: string
  status?: CompanyHybridCorrespondenceStatus
  /** YYYY-MM-DD */
  replyDue?: string | null
  channel?: CompanyHybridCorrespondenceChannel
}

const MAX_COUNTERPARTY = 500
const MAX_OFFICIAL_REF = 200

export function coerceMetadataRecord(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return { ...(raw as Record<string, unknown>) }
}

function isDirection(v: string): v is CompanyHybridCorrespondenceDirection {
  return (COMPANY_HYBRID_CORRESPONDENCE_DIRECTIONS as readonly string[]).includes(v)
}

function isStatus(v: string): v is CompanyHybridCorrespondenceStatus {
  return (COMPANY_HYBRID_CORRESPONDENCE_STATUSES as readonly string[]).includes(v)
}

function isChannel(v: string): v is CompanyHybridCorrespondenceChannel {
  return (COMPANY_HYBRID_CORRESPONDENCE_CHANNELS as readonly string[]).includes(v)
}

function trimSlice(s: string, max: number): string {
  return s.trim().slice(0, max)
}

/** metadata.correspondence 를 UI/API용 객체로 읽기 */
export function getCorrespondenceFromMetadata(metadata: unknown): CompanyHybridCorrespondence | null {
  const m = coerceMetadataRecord(metadata)
  const c = m.correspondence
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null
  return sanitizeCorrespondenceFromBody(c)
}

/** 목록·필터 — 유효한 공문 필드가 하나라도 있을 때만 true (빈 `{}` 키만 있으면 false) */
export function documentHasCorrespondence(metadata: unknown): boolean {
  return getCorrespondenceFromMetadata(metadata) != null
}

function hasAnyCorrespondenceField(c: CompanyHybridCorrespondence): boolean {
  return !!(
    c.direction ||
    (c.counterparty && c.counterparty.length > 0) ||
    (c.officialRef && c.officialRef.length > 0) ||
    c.status ||
    (c.replyDue != null && String(c.replyDue).trim() !== '') ||
    c.channel
  )
}

/**
 * 요청 본문의 correspondence / metadata.correspondence 를 정제.
 * 비어 있으면 null (= correspondence 키 제거 의도).
 */
export function sanitizeCorrespondenceFromBody(body: unknown): CompanyHybridCorrespondence | null {
  if (body == null) return null
  if (typeof body !== 'object' || Array.isArray(body)) return null
  const o = body as Record<string, unknown>
  const out: CompanyHybridCorrespondence = {}

  const dir = String(o.direction ?? o.dir ?? '').trim().toLowerCase()
  if (dir && isDirection(dir)) out.direction = dir

  const cp = trimSlice(String(o.counterparty ?? o.counter_party ?? ''), MAX_COUNTERPARTY)
  if (cp) out.counterparty = cp

  const ref = trimSlice(String(o.officialRef ?? o.official_ref ?? ''), MAX_OFFICIAL_REF)
  if (ref) out.officialRef = ref

  const st = String(o.status ?? '').trim().toLowerCase()
  if (st && isStatus(st)) out.status = st

  const rdRaw = o.replyDue ?? o.reply_due
  if (rdRaw != null && String(rdRaw).trim() !== '') {
    const rd = String(rdRaw).trim().slice(0, 10)
    out.replyDue = /^\d{4}-\d{2}-\d{2}$/.test(rd) ? rd : null
  }

  const ch = String(o.channel ?? '').trim().toLowerCase()
  if (ch && isChannel(ch)) out.channel = ch

  return hasAnyCorrespondenceField(out) ? out : null
}

/**
 * 기존 metadata에 공문을 반영한 전체 metadata.
 * `correspondencePatch === undefined` 이면 correspondence 키는 건드리지 않음(구 클라이언트 호환).
 */
export function mergeMetadataWithCorrespondence(
  existingMetadata: unknown,
  correspondencePatch: unknown
): Record<string, unknown> {
  const base = coerceMetadataRecord(existingMetadata)
  const next: Record<string, unknown> = { ...base }
  if (correspondencePatch === undefined) {
    return next
  }
  const sanitized = sanitizeCorrespondenceFromBody(correspondencePatch)
  if (sanitized == null) {
    delete next.correspondence
  } else {
    next.correspondence = { ...sanitized }
  }
  return next
}
