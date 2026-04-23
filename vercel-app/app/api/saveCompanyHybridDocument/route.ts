import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import {
  isCompanyHybridRelatedType,
  isReasonableExternalUrl,
  isCompanyHybridSource,
} from '@/lib/company-hybrid-documents'
import { canAccessStoreForCompanyHybridDocs } from '@/lib/company-hybrid-documents-access'
import { logCompanyHybridDocumentEvent } from '@/lib/company-hybrid-documents-audit'
import { validateCompanyHybridRelated } from '@/lib/company-hybrid-documents-validate'
import { resolveCategoryIdForDocument } from '@/lib/company-hybrid-category-server'

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
    const title = norm(body.title)
    const relatedType = norm(body.relatedType || body.related_type)
    const relatedId = norm(body.relatedId || body.related_id)
    const docType = norm(body.docType || body.doc_type)
    const categoryIdIn = body.categoryId ?? body.category_id
    const sourceInput = norm(body.source)
    const externalUrl = norm(body.externalUrl || body.external_url)
    const note = norm(body.note)
    const validFrom = body.validFrom != null && String(body.validFrom).trim() ? String(body.validFrom).slice(0, 10) : null
    const validTo = body.validTo != null && String(body.validTo).trim() ? String(body.validTo).slice(0, 10) : null

    if (!store) {
      return NextResponse.json({ success: false, message: '매장(store)이 필요합니다.' }, { status: 400, headers })
    }
    if (!canAccessStoreForCompanyHybridDocs(auth, store)) {
      return NextResponse.json(
        { success: false, message: '이 매장에 대한 권한이 없습니다.' },
        { status: 403, headers }
      )
    }
    if (!isCompanyHybridRelatedType(relatedType)) {
      return NextResponse.json({ success: false, message: '유효하지 않은 relatedType입니다.' }, { status: 400, headers })
    }
    const rId = relatedType === 'none' ? null : relatedId
    if (rId) {
      const relErr = await validateCompanyHybridRelated(
        relatedType,
        rId,
        store,
        String(auth.role || ''),
        String(auth.store || ''),
        auth
      )
      if (relErr) {
        return NextResponse.json({ success: false, message: relErr }, { status: 400, headers })
      }
    } else if (relatedType !== 'none') {
      return NextResponse.json(
        { success: false, message: '관련 ID가 필요합니다.' },
        { status: 400, headers }
      )
    }

    const catRes = await resolveCategoryIdForDocument(store, categoryIdIn)
    if (!catRes.ok) {
      return NextResponse.json({ success: false, message: catRes.message }, { status: 400, headers })
    }
    const categoryId = catRes.category_id

    if (id && Number.isFinite(id) && id > 0) {
      const existing = (await supabaseSelectFilter('company_hybrid_documents', `id=eq.${id}`, {
        limit: 1,
      })) as
        | {
            id?: number
            store?: string
            source?: string
            title?: string
            deleted_at?: string | null
          }[]
        | null
      const row = existing?.[0]
      if (!row || row.deleted_at) {
        return NextResponse.json({ success: false, message: '문서를 찾을 수 없습니다.' }, { status: 404, headers })
      }
      if (String(row.store) !== store) {
        return NextResponse.json(
          { success: false, message: '기존 문서의 store와 일치하도록 store를 맞추세요.' },
          { status: 400, headers }
        )
      }
      if (sourceInput && isCompanyHybridSource(sourceInput) && sourceInput !== String(row.source)) {
        return NextResponse.json(
          { success: false, message: 'source는 기존 값(drive|supabase)을 유지하세요.' },
          { status: 400, headers }
        )
      }
      if (!title) {
        return NextResponse.json({ success: false, message: '제목이 필요합니다.' }, { status: 400, headers })
      }
      if (row.source === 'drive') {
        if (!isReasonableExternalUrl(externalUrl)) {
          return NextResponse.json(
            { success: false, message: 'https로 시작하는 유효한 Google Drive(또는 링크) URL을 입력하세요.' },
            { status: 400, headers }
          )
        }
        await supabaseUpdate('company_hybrid_documents', id, {
          title,
          related_type: relatedType,
          related_id: rId,
          doc_type: docType || null,
          category_id: categoryId,
          external_url: externalUrl,
          valid_from: validFrom,
          valid_to: validTo,
          note: note || null,
          updated_at: new Date().toISOString(),
        })
      } else {
        await supabaseUpdate('company_hybrid_documents', id, {
          title,
          related_type: relatedType,
          related_id: rId,
          doc_type: docType || null,
          category_id: categoryId,
          valid_from: validFrom,
          valid_to: validTo,
          note: note || null,
          updated_at: new Date().toISOString(),
        })
      }
      await logCompanyHybridDocumentEvent(
        id,
        'update',
        store,
        { name: auth.name, store: auth.store },
        { title, relatedType }
      )
      return NextResponse.json({ success: true, id, message: '저장되었습니다.' }, { headers })
    }

    if (!title) {
      return NextResponse.json({ success: false, message: '제목이 필요합니다.' }, { status: 400, headers })
    }
    if (!isCompanyHybridSource(sourceInput) || sourceInput !== 'drive') {
      return NextResponse.json(
        { success: false, message: 'Google Drive는 source=drive와 externalUrl로 등록하세요. 파일 업로드는 Storage 완료 API를 쓰세요.' },
        { status: 400, headers }
      )
    }
    if (!isReasonableExternalUrl(externalUrl)) {
      return NextResponse.json(
        { success: false, message: 'https로 시작하는 유효한 Google Drive(또는 링크) URL을 입력하세요.' },
        { status: 400, headers }
      )
    }

    const now = new Date().toISOString()
    const inserted = await supabaseInsert('company_hybrid_documents', {
      store,
      related_type: relatedType,
      related_id: rId,
      doc_type: docType || null,
      category_id: categoryId,
      title,
      source: 'drive',
      external_url: externalUrl,
      public_url: null,
      storage_path: null,
      file_name: null,
      file_size: null,
      mime: null,
      valid_from: validFrom,
      valid_to: validTo,
      note: note || null,
      created_by_name: auth.name || null,
      created_by_store: auth.store || null,
      created_at: now,
      updated_at: now,
    })
    const newRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (newRow as { id?: number })?.id
    if (newId == null) {
      return NextResponse.json({ success: false, message: '저장에 실패했습니다.' }, { status: 500, headers })
    }
    await logCompanyHybridDocumentEvent(
      newId,
      'create',
      store,
      { name: auth.name, store: auth.store },
      { title, relatedType, source: 'drive' }
    )
    return NextResponse.json({ success: true, id: newId, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveCompanyHybridDocument:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
