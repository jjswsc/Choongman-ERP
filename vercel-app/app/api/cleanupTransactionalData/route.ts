/**
 * 직원/품목/거래처 변경으로 인한 고아 데이터 전체 삭제
 * POST 요청 시 아래 테이블의 모든 행 삭제
 *
 * 삭제 대상: 출퇴근, 휴가, 급여, 일정, 재고이력, 매장설정, 주문, 방문기록,
 *           업무일지, 점검결과, 컴플레인, 메뉴권한, 공지확인, 평가결과, 인보이스, 패티캐시
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseSelect } from '@/lib/supabase-server'

const TABLES_NUMERIC_ID = [
  'attendance_logs',
  'leave_requests',
  'payroll_records',
  'schedules',
  'stock_logs',
  'store_settings',
  'orders',
  'complaint_logs',
  'menu_permissions',
  'notice_reads',
  'invoices',
  'petty_cash_transactions',
] as const
const TABLES_TEXT_ID = ['work_logs', 'check_results', 'evaluation_results', 'store_visits'] as const

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json().catch(() => ({}))) as { confirm?: string }
    if (String(body.confirm || '').toLowerCase() !== 'yes') {
      return NextResponse.json(
        { success: false, message: '확인을 위해 body에 { "confirm": "yes" } 를 포함해 요청하세요.' },
        { headers }
      )
    }

    const results: { table: string; ok: boolean; error?: string }[] = []
    const runDelete = async (table: string, filter: string) => {
      const existing = (await supabaseSelect(table, { limit: 1 })) as unknown[] | null
      if (existing && existing.length > 0) {
        await supabaseDeleteByFilter(table, filter)
      }
    }
    for (const table of TABLES_NUMERIC_ID) {
      try {
        await runDelete(table, 'id=gte.0')
        results.push({ table, ok: true })
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        if (errMsg.includes('404') || errMsg.includes('does not exist') || errMsg.includes('relation')) {
          results.push({ table, ok: true })
        } else {
          results.push({ table, ok: false, error: errMsg })
        }
      }
    }
    for (const table of TABLES_TEXT_ID) {
      try {
        await runDelete(table, 'id=like.%25')
        results.push({ table, ok: true })
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e)
        if (errMsg.includes('404') || errMsg.includes('does not exist') || errMsg.includes('relation')) {
          results.push({ table, ok: true })
        } else {
          results.push({ table, ok: false, error: errMsg })
        }
      }
    }

    const failed = results.filter((r) => !r.ok)
    if (failed.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `일부 테이블 삭제 실패: ${failed.map((f) => f.table).join(', ')}`,
          results,
        },
        { headers }
      )
    }

    const totalTables = TABLES_NUMERIC_ID.length + TABLES_TEXT_ID.length
    return NextResponse.json(
      {
        success: true,
        message: `${totalTables}개 테이블 데이터 삭제 완료`,
        results,
      },
      { headers }
    )
  } catch (e) {
    console.error('cleanupTransactionalData:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '삭제 실패' },
      { headers }
    )
  }
}
