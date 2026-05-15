/**
 * 헬스체크 - Supabase 연결 및 환경 변수 확인
 * 브라우저에서 /api/health 호출 시 연결 상태 진단
 */
import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

export async function GET() {
  const result: {
    ok: boolean
    checkedAt: string
    env: { hasUrl: boolean; hasServiceKey: boolean; hasAnonKey: boolean }
    supabase: { connected: boolean; error?: string; vendorsCount?: number; posOrdersCount?: number }
    dependencies: { db: 'up' | 'down'; external: 'unknown' }
  } = {
    ok: false,
    checkedAt: new Date().toISOString(),
    env: {
      hasUrl: !!process.env.SUPABASE_URL?.trim(),
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
      hasAnonKey: !!process.env.SUPABASE_ANON_KEY?.trim(),
    },
    supabase: { connected: false },
    dependencies: { db: 'down', external: 'unknown' },
  }

  if (!result.env.hasUrl || (!result.env.hasServiceKey && !result.env.hasAnonKey)) {
    return NextResponse.json({
      ...result,
      msg: result.env.hasUrl ? 'SUPABASE_SERVICE_ROLE_KEY 또는 SUPABASE_ANON_KEY가 없습니다.' : 'SUPABASE_URL이 없습니다. Vercel 환경 변수를 확인하세요.',
    }, { status: 503 })
  }

  try {
    const vendors = (await supabaseSelect('vendors', { limit: 1 })) as unknown[]
    const posOrders = (await supabaseSelect('pos_orders', { limit: 1 })) as unknown[]
    result.supabase.connected = true
    result.supabase.vendorsCount = Array.isArray(vendors) ? vendors.length : 0
    result.supabase.posOrdersCount = Array.isArray(posOrders) ? posOrders.length : 0
    result.dependencies.db = 'up'
    result.ok = true
    return NextResponse.json(result)
  } catch (e) {
    result.supabase.error = e instanceof Error ? e.message : String(e)
    result.dependencies.db = 'down'
    return NextResponse.json(result, { status: 503 })
  }
}
