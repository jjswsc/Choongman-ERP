/**
 * 서버가 Supabase에 어떤 키로 요청하는지 확인용.
 * RLS 오류 시: usingServiceRole가 false면 SERVICE_ROLE_KEY가 없음 → Vercel env 확인.
 * 키 값은 절대 노출하지 않음.
 */
import { NextResponse } from 'next/server'

export async function GET() {
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim()
  const hasServiceRole = serviceKey.length > 0
  const hasAnon = anonKey.length > 0
  return NextResponse.json({
    usingServiceRole: hasServiceRole,
    hasAnonKey: hasAnon,
    hint: hasServiceRole
      ? '서버는 service_role 사용 중 (RLS 우회). 그래도 42501 나오면 Supabase 정책을 확인하세요.'
      : '서버는 anon 키 사용 중. pos_orders에 INSERT/UPDATE 정책이 있어야 합니다. 또는 Vercel에 SUPABASE_SERVICE_ROLE_KEY를 설정하세요.',
  })
}
