import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/**
 * 급여_DB(payroll_records) 테이블 준비 확인.
 * Supabase에서는 schema 적용 시 테이블이 생성되므로, 존재 여부만 확인하고 메시지 반환.
 */
export async function GET() {
  try {
    await supabaseSelect('payroll_records', { limit: 1 })
    return NextResponse.json({
      success: true,
      msg: '이미 [급여_DB]가 준비되어 있습니다. 계산 실행을 진행하세요.',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        success: false,
        msg: '급여 DB 준비 실패: ' + msg + '. Supabase 스키마(migration)를 확인해주세요.',
      },
      { status: 500 }
    )
  }
}
