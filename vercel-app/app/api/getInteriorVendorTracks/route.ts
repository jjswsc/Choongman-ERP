import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 프로젝트 업체 일정/결제 트래킹 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json([], { headers })

  try {
    const rows = (await supabaseSelectFilter(
      'interior_vendor_tracks',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'sort_order.asc,id.asc', limit: 500 }
    )) as {
      id?: number
      project_id?: number
      vendor_name?: string
      vendor_code?: string
      work_package_id?: number | null
      payment_due_date?: string
      payment_paid_date?: string
      material_eta_date?: string
      material_received_date?: string
      work_completed_date?: string
      status?: string
      amount?: number
      note?: string
      sort_order?: number
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      vendorName: String(r.vendor_name || '').trim(),
      vendorCode: String(r.vendor_code || '').trim(),
      workPackageId: r.work_package_id ?? null,
      paymentDueDate: r.payment_due_date ? String(r.payment_due_date).slice(0, 10) : null,
      paymentPaidDate: r.payment_paid_date ? String(r.payment_paid_date).slice(0, 10) : null,
      materialEtaDate: r.material_eta_date ? String(r.material_eta_date).slice(0, 10) : null,
      materialReceivedDate: r.material_received_date ? String(r.material_received_date).slice(0, 10) : null,
      workCompletedDate: r.work_completed_date ? String(r.work_completed_date).slice(0, 10) : null,
      status: String(r.status || 'planned'),
      amount: Number(r.amount ?? 0),
      note: String(r.note || '').trim(),
      sortOrder: Number(r.sort_order ?? 0),
    }))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorVendorTracks:', e)
    return NextResponse.json([], { headers })
  }
}
