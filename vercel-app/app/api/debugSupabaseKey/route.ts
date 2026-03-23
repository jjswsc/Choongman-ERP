/**
 * 서버가 Supabase에 어떤 키로 요청하는지 확인용.
 * RLS(42501) 시: usingServiceRole·activeKeyJwtRole 을 확인하세요.
 * 키 본문은 절대 노출하지 않음.
 */
import { NextResponse } from 'next/server'

function decodeJwtRole(jwt: string): string | null {
  const parts = jwt.split('.')
  if (parts.length < 2 || !parts[1]) return null
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
    const json = Buffer.from(b64 + pad, 'base64').toString('utf8')
    const p = JSON.parse(json) as { role?: string }
    return typeof p.role === 'string' ? p.role : null
  } catch {
    return null
  }
}

export async function GET() {
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim()
  const url = (process.env.SUPABASE_URL || '').trim()
  const hasServiceRole = serviceKey.length > 0
  const hasAnon = anonKey.length > 0

  const serviceJwtRole = hasServiceRole ? decodeJwtRole(serviceKey) : null
  const anonJwtRole = hasAnon ? decodeJwtRole(anonKey) : null
  /** supabase-server.ts 와 동일: service 우선 */
  const activeKeyRole = hasServiceRole ? serviceJwtRole : anonJwtRole

  const warnings: string[] = []
  if (hasServiceRole && serviceJwtRole && serviceJwtRole !== 'service_role') {
    warnings.push(
      'SUPABASE_SERVICE_ROLE_KEY JWT의 role이 service_role이 아닙니다. anon 키를 잘못 넣었을 수 있습니다. Supabase → Settings → API → service_role secret을 다시 복사하세요.'
    )
  }
  if (hasServiceRole && !serviceJwtRole) {
    warnings.push(
      'SUPABASE_SERVICE_ROLE_KEY가 JWT 형식이 아닙니다. 값이 잘렸거나 따옴표/공백 문제일 수 있습니다.'
    )
  }
  if (hasServiceRole && activeKeyRole === 'service_role' && warnings.length === 0) {
    /* ok */
  } else if (!hasServiceRole) {
    warnings.push(
      'SERVICE_ROLE 키가 비어 있어 anon 키로 요청합니다. Vercel Preview/Production 환경별로 변수가 켜져 있는지, 이름이 정확히 SUPABASE_SERVICE_ROLE_KEY 인지 확인하세요.'
    )
  }

  let hint = ''
  if (hasServiceRole && serviceJwtRole === 'service_role') {
    hint =
      '서버는 service_role JWT로 요청합니다 (RLS 우회). 그래도 42501이면 다른 호스트(로컬/다른 배포)를 치고 있거나 URL·프로젝트가 다른 Supabase를 가리키는지 확인하세요.'
  } else if (!hasServiceRole) {
    hint =
      '서버는 anon 키로 요청 중입니다. Vercel에 SUPABASE_SERVICE_ROLE_KEY를 넣고 Redeploy 하거나, sql/pos_*_rls_policies.sql 을 실행하세요. 로컬은 vercel-app/.env.local 에도 동일 키가 필요합니다.'
  } else {
    hint = '위 warnings를 확인하세요.'
  }

  let urlHost: string | null = null
  try {
    if (url) urlHost = new URL(url.replace(/^http:\/\//, 'https://')).hostname
  } catch {
    urlHost = null
  }

  return NextResponse.json({
    usingServiceRole: hasServiceRole,
    hasAnonKey: hasAnon,
    supabaseUrlHost: urlHost,
    /** JWT 페이로드의 role (노출 안전) */
    serviceKeyJwtRole: serviceJwtRole,
    anonKeyJwtRole: anonJwtRole,
    activeKeyJwtRole: activeKeyRole,
    serviceKeyLength: serviceKey.length,
    anonKeyLength: anonKey.length,
    warnings,
    hint,
  })
}
