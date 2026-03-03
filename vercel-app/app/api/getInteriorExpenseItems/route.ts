import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 프로젝트 비용 항목 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json([], { headers })

  try {
    const rows = (await supabaseSelectFilter(
      'interior_expense_items',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'sort_order.asc,id.asc', limit: 200 }
    )) as {
      id?: number
      project_id?: number
      category?: string
      description?: string
      vendor_code?: string
      quote?: number
      paid?: number
      balance?: number
      payment_schedule?: unknown[]
      sort_order?: number
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      category: String(r.category || '').trim(),
      description: String(r.description || '').trim(),
      vendorCode: String(r.vendor_code || '').trim(),
      quote: Number(r.quote) ?? 0,
      paid: Number(r.paid) ?? 0,
      balance: Number(r.balance) ?? 0,
      paymentSchedule: Array.isArray(r.payment_schedule) ? r.payment_schedule : [],
      sortOrder: r.sort_order ?? 0,
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorExpenseItems:', e)
    return NextResponse.json([], { headers })
  }
}
