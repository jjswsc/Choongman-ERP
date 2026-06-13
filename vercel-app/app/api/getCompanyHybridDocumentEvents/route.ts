import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { canAccessStoreForCompanyHybridDocs } from '@/lib/company-hybrid-documents-access'

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
    const documentId = Math.floor(Number(searchParams.get('documentId') || searchParams.get('id') || 0))
    if (!Number.isFinite(documentId) || documentId <= 0) {
      return NextResponse.json({ success: false, list: [], message: 'documentId가 필요합니다.' }, { status: 400, headers })
    }

    const docRows = (await supabaseSelectFilter('company_hybrid_documents', `id=eq.${documentId}`, {
      limit: 1,
    })) as { store?: string; deleted_at?: string | null }[] | null
    const doc = docRows?.[0]
    if (!doc || doc.deleted_at) {
      return NextResponse.json({ success: false, list: [], message: '문서를 찾을 수 없습니다.' }, { status: 404, headers })
    }
    const docStore = String(doc.store || '').trim()
    if (!canAccessStoreForCompanyHybridDocs(auth, docStore)) {
      return NextResponse.json(
        { success: false, list: [], message: '이 문서에 대한 권한이 없습니다.' },
        { status: 403, headers }
      )
    }

    const rows = (await supabaseSelectFilter(
      'company_hybrid_document_events',
      `document_id=eq.${documentId}`,
      { order: 'created_at.desc', limit: 100 }
    )) as Record<string, unknown>[]

    return NextResponse.json({ success: true, list: rows || [] }, { headers })
  } catch (e) {
    console.error('getCompanyHybridDocumentEvents:', e)
    return NextResponse.json(
      { success: false, list: [], message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
