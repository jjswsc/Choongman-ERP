import 'server-only'
import { isCompanyHybridDocCategoryGlobalStore } from '@/lib/company-hybrid-documents'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** category_id가 활성 카테고리이면 id — 전사 공통(`__company__`) 또는 문서 매장과 일치 */
export async function resolveCategoryIdForDocument(
  store: string,
  categoryIdRaw: unknown
): Promise<{ ok: true; category_id: number | null } | { ok: false; message: string }> {
  if (categoryIdRaw == null || categoryIdRaw === '' || categoryIdRaw === 0) {
    return { ok: true, category_id: null }
  }
  const n = Math.floor(Number(categoryIdRaw))
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, message: 'categoryId가 올바르지 않습니다.' }
  }
  const docStore = String(store || '').trim()
  const rows = (await supabaseSelectFilter(
    'company_hybrid_document_categories',
    `id=eq.${n}&deleted_at=is.null`,
    { limit: 1, select: 'id, store' }
  )) as { id?: number; store?: string }[] | null
  const row = rows?.[0]
  if (!row?.id) {
    return { ok: false, message: '카테고리를 찾을 수 없습니다.' }
  }
  const catStore = String(row.store || '').trim()
  if (!isCompanyHybridDocCategoryGlobalStore(catStore) && catStore !== docStore) {
    return { ok: false, message: '카테고리를 찾을 수 없거나 매장이 일치하지 않습니다.' }
  }
  return { ok: true, category_id: n }
}
