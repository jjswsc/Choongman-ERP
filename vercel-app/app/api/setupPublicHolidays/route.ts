import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/**
 * 공휴일 초기화. Supabase public_holidays 테이블 존재 확인.
 * 선택한 연도에 기본 공휴일이 없으면 삽입 (선택 사항).
 * Apps Script setupPublicHolidaysSheet와 유사 - Supabase는 테이블이 migration으로 존재.
 */
export async function GET() {
  try {
    await supabaseSelect('public_holidays', { limit: 1 })
    return NextResponse.json({
      success: true,
      msg: '이미 [공휴일] 데이터가 준비되어 있습니다. [추가]로 휴일을 넣거나 기존 행을 수정·삭제하세요.',
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { success: false, msg: '공휴일 테이블 준비 실패: ' + msg + '. Supabase 스키마를 확인해주세요.' },
      { status: 500 }
    )
  }
}
