/**
 * 회원앱 CRM 이미지 Storage 버킷.
 * 운영 업로드 URL: .../public/member-portal-content/...
 * `MEMBER_PORTAL_CONTENT_BUCKET` 환경변수로 덮어쓸 수 있다.
 */
export function getMemberPortalContentStorageBucket(): string {
  const fromEnv = String(process.env.MEMBER_PORTAL_CONTENT_BUCKET || '').trim()
  return fromEnv || 'member-portal-content'
}
