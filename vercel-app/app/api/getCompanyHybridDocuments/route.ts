import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { companyHybridDocVisibilityFromDocType } from '@/lib/company-hybrid-documents'
import { canViewCompanyHybridDocument, resolveCompanyHybridListScope } from '@/lib/company-hybrid-documents-access'

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

    const categoryIdRaw = String(searchParams.get('categoryId') || '').trim()
    const titleSearch = String(searchParams.get('searchTitle') || '').trim().slice(0, 200)

    const filterParts =
      listScope.kind === 'all'
        ? ['deleted_at=is.null']
        : [`store=eq.${encodeURIComponent(listScope.store)}`, 'deleted_at=is.null']
    if (categoryIdRaw === 'none' || categoryIdRaw === '0' || categoryIdRaw === 'uncategorized') {
      filterParts.push('category_id=is.null')
    } else if (categoryIdRaw && /^\d+$/.test(categoryIdRaw)) {
      filterParts.push(`category_id=eq.${categoryIdRaw}`)
    }
    if (titleSearch) {
      const pat = `*${titleSearch.replace(/\*/g, ' ').trim().replace(/%/g, '')}*`
      if (pat.length > 2) {
        filterParts.push(`title=ilike.${encodeURIComponent(pat)}`)
      }
    }
    const sortTitleRaw = String(searchParams.get('sortTitle') || '').trim().toLowerCase()
    const order =
      sortTitleRaw === 'asc'
        ? 'title.asc'
        : sortTitleRaw === 'desc'
          ? 'title.desc'
          : 'created_at.desc'

    const rows = (await supabaseSelectFilter(
      'company_hybrid_documents',
      filterParts.join('&'),
      { order, limit: 500 }
    )) as Record<string, unknown>[]
    const visibleRows = (rows || []).filter((row) => {
      const rowStore = String((row as { store?: string | null }).store || '')
      const visibility = companyHybridDocVisibilityFromDocType(
        (row as { doc_type?: string | null }).doc_type
      )
      return canViewCompanyHybridDocument(auth, rowStore, visibility)
    })

    return NextResponse.json({ success: true, list: visibleRows }, { headers })
  } catch (e) {
    console.error('getCompanyHybridDocuments:', e)
    return NextResponse.json(
      {
        success: false,
        list: [],
        message: e instanceof Error ? e.message : String(e),
      },
      { status: 500, headers }
    )
  }
}
