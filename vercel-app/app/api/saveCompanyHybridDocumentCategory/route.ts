import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { canAccessStoreForCompanyHybridDocs } from '@/lib/company-hybrid-documents-access'

export const dynamic = 'force-dynamic'

function norm(s: unknown): string {
  return String(s ?? '').trim()
}

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
    const body = (await request.json()) as Record<string, unknown>
    const id = body.id != null ? Number(body.id) : null
    const store = norm(body.store)
    const name = norm(body.name)
    const sortOrder = body.sortOrder != null ? Math.floor(Number(body.sortOrder)) : 0
    if (!store) {
      return NextResponse.json({ success: false, message: 'store가 필요합니다.' }, { status: 400, headers })
    }
    if (!canAccessStoreForCompanyHybridDocs(auth, store)) {
      return NextResponse.json(
        { success: false, message: '이 매장에 대한 권한이 없습니다.' },
        { status: 403, headers }
      )
    }
    if (!name) {
      return NextResponse.json({ success: false, message: '카테고리 이름이 필요합니다.' }, { status: 400, headers })
    }
    if (name.length > 200) {
      return NextResponse.json(
        { success: false, message: '이름은 200자 이하로 해 주세요.' },
        { status: 400, headers }
      )
    }
    const now = new Date().toISOString()
    if (id && Number.isFinite(id) && id > 0) {
      const ex = (await supabaseSelectFilter('company_hybrid_document_categories', `id=eq.${id}`, { limit: 1 })) as
        | { id?: number; store?: string; deleted_at?: string | null }[]
        | null
      const r = ex?.[0]
      if (!r || r.deleted_at) {
        return NextResponse.json({ success: false, message: '카테고리를 찾을 수 없습니다.' }, { status: 404, headers })
      }
      if (String(r.store) !== store) {
        return NextResponse.json({ success: false, message: '매장이 일치하지 않습니다.' }, { status: 400, headers })
      }
      await supabaseUpdate('company_hybrid_document_categories', id, {
        name,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
        updated_at: now,
      })
      return NextResponse.json({ success: true, id, message: '저장되었습니다.' }, { headers })
    }
    const inserted = await supabaseInsert('company_hybrid_document_categories', {
      store,
      name,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      created_at: now,
      updated_at: now,
    })
    const newRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (newRow as { id?: number })?.id
    if (newId == null) {
      return NextResponse.json({ success: false, message: '저장에 실패했습니다.' }, { status: 500, headers })
    }
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveCompanyHybridDocumentCategory:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
