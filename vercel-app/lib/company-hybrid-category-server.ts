import 'server-only'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** category_id가 해당 store의 활성 카테고리이면 id, 아니면 null(미지정), 잘못되면 throw 대신 { ok: false } */
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
  const rows = (await supabaseSelectFilter(
    'company_hybrid_document_categories',
    `id=eq.${n}&store=eq.${encodeURIComponent(String(store).trim())}&deleted_at=is.null`,
    { limit: 1, select: 'id' }
  )) as { id?: number }[] | null
  if (!rows?.[0]?.id) {
    return { ok: false, message: '카테고리를 찾을 수 없거나 매장이 일치하지 않습니다.' }
  }
  return { ok: true, category_id: n }
}
