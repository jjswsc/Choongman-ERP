import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import {
  isCompanyHybridDocVisibility,
  companyHybridDocVisibilityToDocType,
  isReasonableExternalUrl,
  isCompanyHybridSource,
} from '@/lib/company-hybrid-documents'
import { canAccessStoreForCompanyHybridDocs } from '@/lib/company-hybrid-documents-access'
import { logCompanyHybridDocumentEvent } from '@/lib/company-hybrid-documents-audit'
import { resolveCategoryIdForDocument } from '@/lib/company-hybrid-category-server'
import { mergeMetadataWithCorrespondence } from '@/lib/company-hybrid-correspondence'

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
    const visibilityRaw = norm(body.visibility || body.permission || body.docPermission || body.doc_permission)
    const visibility = isCompanyHybridDocVisibility(visibilityRaw) ? visibilityRaw : 'all'
    const categoryIdIn = body.categoryId ?? body.category_id
    const sourceInput = norm(body.source)
    const externalUrl = norm(body.externalUrl || body.external_url)
    const note = norm(body.note)
    const validFrom = body.validFrom != null && String(body.validFrom).trim() ? String(body.validFrom).slice(0, 10) : null
    const validTo = body.validTo != null && String(body.validTo).trim() ? String(body.validTo).slice(0, 10) : null
    const hasCorrespondenceKey = Object.prototype.hasOwnProperty.call(body, 'correspondence')

    if (!store) {
      return NextResponse.json({ success: false, message: '매장(store)이 필요합니다.' }, { status: 400, headers })
    }
    if (!canAccessStoreForCompanyHybridDocs(auth, store)) {
      return NextResponse.json(
        { success: false, message: '이 매장에 대한 권한이 없습니다.' },
        { status: 403, headers }
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
            metadata?: unknown
          }[]
        | null
      const row = existing?.[0]
      if (!row || row.deleted_at) {
        return NextResponse.json({ success: false, message: '문서를 찾을 수 없습니다.' }, { status: 404, headers })
      }
      const oldStore = String(row.store || '').trim()
      if (oldStore !== store) {
        if (!canAccessStoreForCompanyHybridDocs(auth, oldStore)) {
          return NextResponse.json(
            { success: false, message: '기존 매장 문서를 수정할 권한이 없습니다.' },
            { status: 403, headers }
          )
        }
        if (!canAccessStoreForCompanyHybridDocs(auth, store)) {
          return NextResponse.json(
            { success: false, message: '이동할 매장에 대한 권한이 없습니다.' },
            { status: 403, headers }
          )
        }
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
      const metaPatch = hasCorrespondenceKey
        ? mergeMetadataWithCorrespondence(row.metadata, body.correspondence)
        : null
      if (row.source === 'drive') {
        if (!isReasonableExternalUrl(externalUrl)) {
          return NextResponse.json(
            { success: false, message: 'https로 시작하는 유효한 Google Drive(또는 링크) URL을 입력하세요.' },
            { status: 400, headers }
          )
        }
        await supabaseUpdate('company_hybrid_documents', id, {
          ...(oldStore !== store ? { store } : {}),
          title,
          related_type: 'none',
          related_id: null,
          doc_type: companyHybridDocVisibilityToDocType(visibility),
          category_id: categoryId,
          external_url: externalUrl,
          valid_from: validFrom,
          valid_to: validTo,
          note: note || null,
          ...(metaPatch ? { metadata: metaPatch } : {}),
          updated_at: new Date().toISOString(),
        })
      } else {
        await supabaseUpdate('company_hybrid_documents', id, {
          ...(oldStore !== store ? { store } : {}),
          title,
          related_type: 'none',
          related_id: null,
          doc_type: companyHybridDocVisibilityToDocType(visibility),
          category_id: categoryId,
          valid_from: validFrom,
          valid_to: validTo,
          note: note || null,
          ...(metaPatch ? { metadata: metaPatch } : {}),
          updated_at: new Date().toISOString(),
        })
      }
      await logCompanyHybridDocumentEvent(
        id,
        'update',
        store,
        { name: auth.name, store: auth.store },
        { title, visibility }
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
    const metadataNew = mergeMetadataWithCorrespondence(
      {},
      hasCorrespondenceKey ? body.correspondence : undefined
    )
    const inserted = await supabaseInsert('company_hybrid_documents', {
      store,
      related_type: 'none',
      related_id: null,
      doc_type: companyHybridDocVisibilityToDocType(visibility),
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
      metadata: metadataNew,
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
      { title, visibility, source: 'drive' }
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
