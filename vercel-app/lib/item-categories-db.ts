import { isMissingPostgrestTableError } from '@/lib/supabase-missing-table'

export const ITEM_CATEGORIES_TABLE = 'item_categories'

export const ITEM_CATEGORIES_MISSING_MESSAGE =
  '품목 카테고리 테이블이 없습니다. Omni DB에 sql/omni_item_categories_01_create.sql 을 실행해 주세요.'

export function isMissingItemCategoriesTableError(e: unknown): boolean {
  return isMissingPostgrestTableError(e, ITEM_CATEGORIES_TABLE)
}
