/**
 * 단일 배포 파이프라인: 웹(Vercel)·Capacitor·Windows Electron이 같은 프로덕션 Origin을 쓰도록 합니다.
 *
 * 우선순위:
 * 1. DEPLOY_PUBLIC_ORIGIN
 * 2. NEXT_PUBLIC_DEPLOY_PUBLIC_ORIGIN (Vercel/프론트와 동일 변수로 맞추기 쉬움)
 * 3. 기본값(내부 실서버) — 판매용은 반드시 환경 변수로 덮어쓰기
 */

const DEFAULT_INTERNAL_ORIGIN = "https://choongman-erp.vercel.app"

function normalizeOrigin(raw) {
  if (raw == null || typeof raw !== "string") return ""
  const t = raw.trim().replace(/\/+$/, "")
  return t
}

function resolveDeployPublicOrigin() {
  const a = normalizeOrigin(process.env.DEPLOY_PUBLIC_ORIGIN)
  if (a) return a
  const b = normalizeOrigin(process.env.NEXT_PUBLIC_DEPLOY_PUBLIC_ORIGIN)
  if (b) return b
  return DEFAULT_INTERNAL_ORIGIN
}

module.exports = {
  DEFAULT_INTERNAL_ORIGIN,
  normalizeOrigin,
  resolveDeployPublicOrigin,
}
