import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseInsert, supabaseStoragePublicUrl } from '@/lib/supabase-server'
import {
  isAllowedCompanyDocContentType,
  isCompanyHybridDocVisibility,
  companyHybridDocVisibilityToDocType,
  COMPANY_DOCUMENTS_BUCKET,
  slugifyStoreForCompanyDocPath,
  parseCompanyHybridDocDate,
} from '@/lib/company-hybrid-documents'
import { canAccessStoreForCompanyHybridDocs } from '@/lib/company-hybrid-documents-access'
import { logCompanyHybridDocumentEvent } from '@/lib/company-hybrid-documents-audit'
import { resolveCategoryIdForDocument } from '@/lib/company-hybrid-category-server'
import { mergeMetadataWithCorrespondence } from '@/lib/company-hybrid-correspondence'
import { parseCompanyHybridDocRelatedFromBody } from '@/lib/company-hybrid-documents-related'

const BUCKET = COMPANY_DOCUMENTS_BUCKET

function norm(s: unknown): string {
  return String(s ?? '').trim()
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const body = (await request.json()) as Record<string, unknown>
    const store = norm(body.store)
    const title = norm(body.title)
    const visibilityRaw = norm(body.visibility || body.permission || body.docPermission || body.doc_permission)
    const visibility = isCompanyHybridDocVisibility(visibilityRaw) ? visibilityRaw : 'all'
    const categoryIdIn = body.categoryId ?? body.category_id
    const note = norm(body.note)
    const validFrom = parseCompanyHybridDocDate(body.validFrom)
    const validTo = parseCompanyHybridDocDate(body.validTo)
    const hasCorrespondenceKey = Object.prototype.hasOwnProperty.call(body, 'correspondence')
    const related = parseCompanyHybridDocRelatedFromBody(body)
    const fileName = norm(body.fileName)
    const storagePath = norm(body.storagePath)
    const fileSize = Number(body.fileSize)
    const mime = String(body.mime || body.contentType || '')
      .toLowerCase()
      .split(';')[0]
      .trim()

    if (!store) {
      return NextResponse.json({ success: false, message: '매장(store)이 필요합니다.' }, { status: 400, headers })
    }
    if (!canAccessStoreForCompanyHybridDocs(auth, store)) {
      return NextResponse.json(
        { success: false, message: '이 매장에 대한 권한이 없습니다.' },
        { status: 403, headers }
      )
    }
    if (!title) {
      return NextResponse.json({ success: false, message: '제목이 필요합니다.' }, { status: 400, headers })
    }
    const catRes = await resolveCategoryIdForDocument(store, categoryIdIn)
    if (!catRes.ok) {
      return NextResponse.json({ success: false, message: catRes.message }, { status: 400, headers })
    }
    const categoryId = catRes.category_id

    if (!fileName) {
      return NextResponse.json({ success: false, message: 'fileName이 필요합니다.' }, { status: 400, headers })
    }
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      return NextResponse.json({ success: false, message: 'fileSize가 필요합니다.' }, { status: 400, headers })
    }
    if (!isAllowedCompanyDocContentType(mime)) {
      return NextResponse.json({ success: false, message: '지원되지 않는 파일 형식입니다.' }, { status: 400, headers })
    }
    if (!storagePath || !storagePath.startsWith(`hybrid/${slugifyStoreForCompanyDocPath(store)}/`)) {
      return NextResponse.json(
        { success: false, message: '유효한 storagePath가 아닙니다(매장이 presign과 일치해야 합니다).' },
        { status: 400, headers }
      )
    }

    const publicUrl = supabaseStoragePublicUrl(BUCKET, storagePath)
    const now = new Date().toISOString()
    const metadataNew = mergeMetadataWithCorrespondence(
      {},
      hasCorrespondenceKey ? body.correspondence : undefined
    )
    const inserted = await supabaseInsert('company_hybrid_documents', {
      store,
      related_type: related.related_type,
      related_id: related.related_id,
      doc_type: companyHybridDocVisibilityToDocType(visibility),
      category_id: categoryId,
      title,
      source: 'supabase',
      external_url: null,
      public_url: publicUrl,
      storage_path: storagePath,
      file_name: fileName,
      file_size: fileSize,
      mime,
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
      return NextResponse.json({ success: false, message: 'DB 저장에 실패했습니다.' }, { status: 500, headers })
    }
    await logCompanyHybridDocumentEvent(
      newId,
      'create',
      store,
      { name: auth.name, store: auth.store },
      { title, visibility, source: 'supabase', storagePath }
    )
    return NextResponse.json({ success: true, id: newId, url: publicUrl, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('uploadCompanyHybridDocument/complete:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
