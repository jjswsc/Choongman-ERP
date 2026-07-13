/** 클라이언트·API JSON 공용 — server-only 모듈에 의존하지 않음 */

export type SaasScopeKind = "platform" | "partner"

export type SaasScopeClientMeta = {
  kind: SaasScopeKind
  isPlatform: boolean
  isPartner: boolean
  partnerId: string | null
  partnerName: string | null
  defaultMarginPct: number
}

/** 본사 SaaS 관리자 UI 스코프 — 역할(Director/Officer/Accounting)로 즉시 확정 가능 */
export const PLATFORM_SCOPE_CLIENT_META: SaasScopeClientMeta = {
  kind: "platform",
  isPlatform: true,
  isPartner: false,
  partnerId: null,
  partnerName: null,
  defaultMarginPct: 0,
}
