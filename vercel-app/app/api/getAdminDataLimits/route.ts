import { NextResponse } from 'next/server'
import { buildAdminDataLimitsPayload } from '@/lib/admin-data-limits-report'

/**
 * 관리자 설정 — Supabase 조회 상한 + 주요 API 한도 샘플 + 테이블 행 수(사용량).
 * 키·URL 미포함. 캐시 없이 매 요청 시점 기준.
 */
export async function GET() {
  try {
    return NextResponse.json(await buildAdminDataLimitsPayload())
  } catch (e) {
    console.error('getAdminDataLimits:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'unknown' },
      { status: 500 }
    )
  }
}
