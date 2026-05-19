import 'server-only'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/**
 * category_id가 활성 카테고리이면 id를 반환.
 * 카테고리는 전 매장 공통으로 고르며(레거시는 store 컬럼에 매장명이 남아 있어도),
 * 문서 매장을 옮겨도 동일 category_id를 유지할 수 있다.
 */
export async function resolveCategoryIdForDocument(
  _store: string,
  categoryIdRaw: unknown
): Promise<{ ok: true; category_id: number | null } | { ok: false; message: string }> {
  if (categoryIdRaw == null || categoryIdRaw === '' || categoryIdRaw === 0) {
    return { ok: true, category_id: null }
  }
  const n = Math.floor(Number(categoryIdRaw))
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, message: 'categoryId가 올바르지 않습니다.' }
  }
  const rows = (await supabaseSelectFilter(
    'company_hybrid_document_categories',
    `id=eq.${n}&deleted_at=is.null`,
    { limit: 1, select: 'id' }
  )) as { id?: number }[] | null
  const row = rows?.[0]
  if (!row?.id) {
    return { ok: false, message: '카테고리를 찾을 수 없습니다.' }
  }
  return { ok: true, category_id: n }
}
