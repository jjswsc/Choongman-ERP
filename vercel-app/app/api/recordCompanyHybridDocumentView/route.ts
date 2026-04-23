import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  canAccessStoreForCompanyHybridDocs,
  canListAllStoresCompanyHybridDocs,
} from '@/lib/company-hybrid-documents-access'
import { logCompanyHybridDocumentEvent } from '@/lib/company-hybrid-documents-audit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      const er = authResult.errorResponse
      er.headers.set('Access-Control-Allow-Origin', '*')
      return er
    }
    const auth = authResult.auth
    const body = (await request.json()) as { id?: number }
    const id = body.id != null ? Number(body.id) : 0
    if (!id) {
      return NextResponse.json({ success: false, message: 'id가 필요합니다.' }, { status: 400, headers })
    }
    const existing = (await supabaseSelectFilter('company_hybrid_documents', `id=eq.${id}`, {
      limit: 1,
    })) as { id?: number; store?: string; deleted_at?: string | null; title?: string }[] | null
    const row = existing?.[0]
    if (!row || row.deleted_at) {
      return NextResponse.json({ success: false, message: '문서를 찾을 수 없습니다.' }, { status: 404, headers })
    }
    const st = String(row.store || '')
    if (
      !canAccessStoreForCompanyHybridDocs(auth, st) &&
      !canListAllStoresCompanyHybridDocs(auth)
    ) {
      return NextResponse.json({ success: false, message: '권한이 없습니다.' }, { status: 403, headers })
    }
    await logCompanyHybridDocumentEvent(id, 'view', st, { name: auth.name, store: auth.store }, {
      title: row.title,
    })
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('recordCompanyHybridDocumentView:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
