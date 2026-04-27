import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { resolveCompanyHybridListScope } from '@/lib/company-hybrid-documents-access'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      const er = authResult.errorResponse
      er.headers.set('Access-Control-Allow-Origin', '*')
      return er
    }
    const auth = authResult.auth
    const { searchParams } = new URL(request.url)
    const storeParam = String(searchParams.get('store') || '').trim()
    const scopeRes = resolveCompanyHybridListScope(auth, storeParam)
    if (!scopeRes.ok) {
      return NextResponse.json({ success: false, list: [], message: scopeRes.message }, { status: 400, headers })
    }
    const listScope = scopeRes.scope
    const filter =
      listScope.kind === 'all'
        ? 'deleted_at=is.null'
        : `store=eq.${encodeURIComponent(listScope.store)}&deleted_at=is.null`
    let rows: Record<string, unknown>[] = []
    try {
      rows = (await supabaseSelectFilter(
        'company_hybrid_document_categories',
        filter,
        {
          order: 'store.asc,sort_order.asc,id.asc',
          limit: 5000,
          select: 'id, store, name, sort_order, parent_category_id, created_at',
        }
      )) as Record<string, unknown>[]
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 구버전 스키마(parent_category_id 미존재) 환경 폴백
      if (!/42703|parent_category_id/i.test(msg)) throw e
      const fallbackRows = (await supabaseSelectFilter(
        'company_hybrid_document_categories',
        filter,
        {
          order: 'store.asc,sort_order.asc,id.asc',
          limit: 5000,
          select: 'id, store, name, sort_order, created_at',
        }
      )) as Record<string, unknown>[]
      rows = (fallbackRows || []).map((r) => ({ ...r, parent_category_id: null }))
    }
    return NextResponse.json({ success: true, list: rows || [] }, { headers })
  } catch (e) {
    console.error('getCompanyHybridDocumentCategories:', e)
    return NextResponse.json(
      { success: false, list: [], message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
