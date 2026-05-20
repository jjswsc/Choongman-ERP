import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { canAccessStoreForCompanyHybridDocs } from '@/lib/company-hybrid-documents-access'
import { COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE } from '@/lib/company-hybrid-documents'

export const dynamic = 'force-dynamic'

function norm(s: unknown): string {
  return String(s ?? '').trim()
}

/** DB store 컬럼 정규화 — 빈 값·레거시는 전사 공통 키로 취급 */
function resolveCategoryStoreKey(raw: unknown): string {
  const s = norm(raw)
  return s || COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE
}

type CategoryRow = {
  id?: number
  store?: string
  deleted_at?: string | null
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
    const bodyStore = norm(body.store)
    const name = norm(body.name)
    const sortOrder = body.sortOrder != null ? Math.floor(Number(body.sortOrder)) : 0
    const parentCategoryIdRaw = body.parentCategoryId
    const parentCategoryId =
      parentCategoryIdRaw == null || parentCategoryIdRaw === ''
        ? null
        : Math.floor(Number(parentCategoryIdRaw))
    const isUpdate = id != null && Number.isFinite(id) && id > 0

    if (!name) {
      return NextResponse.json({ success: false, message: '카테고리 이름이 필요합니다.' }, { status: 400, headers })
    }
    if (name.length > 200) {
      return NextResponse.json(
        { success: false, message: '이름은 200자 이하로 해 주세요.' },
        { status: 400, headers }
      )
    }
    if (parentCategoryId != null && (!Number.isFinite(parentCategoryId) || parentCategoryId <= 0)) {
      return NextResponse.json(
        { success: false, message: '상위 카테고리 값이 올바르지 않습니다.' },
        { status: 400, headers }
      )
    }

    let effectiveStore = bodyStore
    let existingRow: CategoryRow | null = null

    if (isUpdate) {
      const ex = (await supabaseSelectFilter('company_hybrid_document_categories', `id=eq.${id}`, {
        limit: 1,
      })) as CategoryRow[] | null
      existingRow = ex?.[0] ?? null
      if (!existingRow || existingRow.deleted_at) {
        return NextResponse.json({ success: false, message: '카테고리를 찾을 수 없습니다.' }, { status: 404, headers })
      }
      effectiveStore = resolveCategoryStoreKey(existingRow.store)
    } else {
      effectiveStore = resolveCategoryStoreKey(bodyStore)
      if (!bodyStore && effectiveStore === COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE) {
        // 신규: body.store 비어 있으면 전사 공통으로 등록
      } else if (!bodyStore) {
        return NextResponse.json({ success: false, message: 'store가 필요합니다.' }, { status: 400, headers })
      }
    }

    if (!canAccessStoreForCompanyHybridDocs(auth, effectiveStore)) {
      return NextResponse.json(
        { success: false, message: '이 매장에 대한 권한이 없습니다.' },
        { status: 403, headers }
      )
    }

    if (parentCategoryId != null) {
      const parentRows = (await supabaseSelectFilter(
        'company_hybrid_document_categories',
        `id=eq.${parentCategoryId}`,
        { limit: 1 }
      )) as CategoryRow[] | null
      const parent = parentRows?.[0]
      if (!parent || parent.deleted_at) {
        return NextResponse.json(
          { success: false, message: '상위 카테고리를 찾을 수 없습니다.' },
          { status: 404, headers }
        )
      }
      // 신규 등록만 store 정합 검사 — 수정은 레거시(매장별 store 컬럼 혼재) 호환
      if (!isUpdate && resolveCategoryStoreKey(parent.store) !== effectiveStore) {
        return NextResponse.json(
          { success: false, message: '상위 카테고리 매장이 일치하지 않습니다.' },
          { status: 400, headers }
        )
      }
      if (isUpdate && Number(id) === Number(parentCategoryId)) {
        return NextResponse.json(
          { success: false, message: '카테고리를 자기 자신의 하위로 지정할 수 없습니다.' },
          { status: 400, headers }
        )
      }
    }

    const now = new Date().toISOString()

    if (isUpdate) {
      const patch: Record<string, unknown> = {
        name,
        sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
        parent_category_id: parentCategoryId,
        updated_at: now,
      }
      if (!norm(existingRow?.store)) {
        patch.store = COMPANY_HYBRID_DOC_CATEGORY_GLOBAL_STORE
      }
      await supabaseUpdate('company_hybrid_document_categories', id!, patch)
      return NextResponse.json({ success: true, id, message: '저장되었습니다.' }, { headers })
    }

    const inserted = await supabaseInsert('company_hybrid_document_categories', {
      store: effectiveStore,
      name,
      sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
      parent_category_id: parentCategoryId,
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
