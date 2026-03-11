/**
 * 가격 이력 기록 - 서버 전용 (API routes)
 * price_history 테이블에 INSERT. 실패해도 메인 저장은 유지.
 */
import { supabaseInsert } from '@/lib/supabase-server'

export type PriceHistoryEntityType = 'pos_menu' | 'pos_menu_option' | 'item'

/** 단일 필드 변경 이력 기록 (비동기, 실패 시 무시) */
export async function recordPriceChange(params: {
  entityType: PriceHistoryEntityType
  entityId: string
  entityDisplayName: string
  fieldName: string
  oldValue: number | null
  newValue: number | null
  changedBy?: string
  category?: string
  categoryMain?: string
  parentEntityId?: string
}): Promise<void> {
  const { entityType, entityId, entityDisplayName, fieldName, oldValue, newValue, changedBy, category, categoryMain, parentEntityId } = params
  const ov = oldValue != null ? Number(oldValue) : null
  const nv = newValue != null ? Number(newValue) : null
  if (ov === nv && ov !== null) return
  try {
    const row: Record<string, unknown> = {
      entity_type: entityType,
      entity_id: entityId,
      entity_display_name: entityDisplayName,
      field_name: fieldName,
      old_value: ov,
      new_value: nv,
      changed_by: changedBy || null,
    }
    if (category) row.category = category
    if (categoryMain) row.category_main = categoryMain
    if (parentEntityId) row.parent_entity_id = parentEntityId
    await supabaseInsert('price_history', row)
  } catch {
    // price_history 테이블이 없거나 오류 시 무시 (메인 저장은 유지)
  }
}

/** 여러 필드 변경 이력 일괄 기록 */
export async function recordPriceChanges(
  params: {
    entityType: PriceHistoryEntityType
    entityId: string
    entityDisplayName: string
    changes: { fieldName: string; oldValue: number | null; newValue: number | null }[]
    changedBy?: string
    category?: string
    categoryMain?: string
    parentEntityId?: string
  }
): Promise<void> {
  const { entityType, entityId, entityDisplayName, changes, changedBy, category, categoryMain, parentEntityId } = params
  for (const c of changes) {
    if (c.oldValue === c.newValue) continue
    await recordPriceChange({
      entityType,
      entityId,
      entityDisplayName,
      fieldName: c.fieldName,
      oldValue: c.oldValue,
      newValue: c.newValue,
      changedBy,
      category,
      categoryMain,
      parentEntityId,
    })
  }
}
