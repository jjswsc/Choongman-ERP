import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 프로젝트 직매입 품목 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const projectId = request.nextUrl.searchParams.get('projectId')
  if (!projectId) return NextResponse.json([], { headers })

  try {
    const rows = (await supabaseSelectFilter(
      'interior_direct_purchases',
      `project_id=eq.${encodeURIComponent(projectId)}`,
      { order: 'category.asc,item_no.asc,id.asc', limit: 300 }
    )) as {
      id?: number
      project_id?: number
      category?: string
      item_no?: number
      description?: string
      qty?: number
      unit?: string
      price?: number
      sum_amount?: number
      supplier_code?: string
      status?: string
      remark?: string
    }[]

    const list = (rows || []).map((r) => ({
      id: r.id,
      projectId: r.project_id,
      category: String(r.category || '').trim(),
      itemNo: r.item_no ?? 0,
      description: String(r.description || '').trim(),
      qty: Number(r.qty) ?? 1,
      unit: String(r.unit || 'set').trim(),
      price: Number(r.price) ?? 0,
      sumAmount: Number(r.sum_amount) ?? 0,
      supplierCode: String(r.supplier_code || '').trim(),
      status: String(r.status || 'pending').trim(),
      remark: String(r.remark || '').trim(),
    }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getInteriorDirectPurchases:', e)
    return NextResponse.json([], { headers })
  }
}
