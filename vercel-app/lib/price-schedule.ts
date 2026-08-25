import {
  supabaseInsert,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from "@/lib/supabase-server"
import { recordPriceChange } from "@/lib/price-history"

export type PriceScheduleStatus = "pending" | "applied" | "cancelled" | "failed"
export type PriceScheduleEntityType = "item" | "pos_menu"

export type PriceScheduleRow = {
  id: number
  entity_type: PriceScheduleEntityType
  entity_id: string
  entity_display_name: string | null
  field_name: string
  scheduled_value: number
  status: PriceScheduleStatus
  effective_at: string
  created_by: string | null
  created_at: string
  applied_at?: string | null
  cancelled_at?: string | null
  failed_reason?: string | null
}

function nowIso(): string {
  return new Date().toISOString()
}

/** PostgREST: 테이블 없음(42P01) 또는 스키마 캐시 미스(PGRST205). Omni 등 미배포 DB에서 cron 500 방지. */
export function isMissingPriceSchedulesTableError(e: unknown): boolean {
  const msg = String(e ?? "")
  return (
    /42P01/i.test(msg) ||
    /PGRST205/i.test(msg) ||
    /Could not find the table/i.test(msg) ||
    /relation ["']?public\.price_schedules["']? does not exist/i.test(msg) ||
    /does not exist/i.test(msg)
  )
}

function allowedFieldNames(entityType: PriceScheduleEntityType): string[] {
  if (entityType === "item") return ["price", "cost"]
  return ["price", "price_delivery"]
}

function parseNumber(v: unknown): number | null {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return n
}

async function readCurrentValue(params: {
  entityType: PriceScheduleEntityType
  entityId: string
  fieldName: string
}): Promise<{ currentValue: number | null; displayName: string | null; category?: string; categoryMain?: string } | null> {
  const { entityType, entityId, fieldName } = params
  if (entityType === "item") {
    const rows = (await supabaseSelectFilter(
      "items",
      `code=eq.${encodeURIComponent(entityId)}`,
      { limit: 1, select: `code,name,category,${fieldName}` }
    )) as { code?: string; name?: string; category?: string; [k: string]: unknown }[] | null
    const row = rows?.[0]
    if (!row) return null
    return {
      currentValue: parseNumber(row[fieldName]),
      displayName: row.name ?? row.code ?? entityId,
      category: String(row.category || "").trim() || undefined,
    }
  }
  const rows = (await supabaseSelectFilter(
    "pos_menus",
    `id=eq.${encodeURIComponent(entityId)}`,
    { limit: 1, select: `id,name,code,category,category_main,${fieldName}` }
  )) as { id?: number; name?: string; code?: string; category?: string; category_main?: string; [k: string]: unknown }[] | null
  const row = rows?.[0]
  if (!row) return null
  return {
    currentValue: parseNumber(row[fieldName]),
    displayName: row.name ?? row.code ?? String(row.id ?? entityId),
    category: String(row.category || "").trim() || undefined,
    categoryMain: String(row.category_main || "").trim() || undefined,
  }
}

export async function createPriceSchedule(params: {
  entityType: PriceScheduleEntityType
  entityId: string
  fieldName: string
  scheduledValue: number
  effectiveAt: string
  createdBy: string
}): Promise<{ success: boolean; message?: string }> {
  const entityType = params.entityType
  const entityId = String(params.entityId || "").trim()
  const fieldName = String(params.fieldName || "").trim()
  const scheduledValue = Number(params.scheduledValue)
  const effectiveAt = String(params.effectiveAt || "").trim()
  if (!entityId) return { success: false, message: "대상 ID가 필요합니다." }
  if (!allowedFieldNames(entityType).includes(fieldName)) {
    return { success: false, message: "허용되지 않은 가격 항목입니다." }
  }
  if (!Number.isFinite(scheduledValue) || scheduledValue < 0) {
    return { success: false, message: "변경 가격은 0 이상이어야 합니다." }
  }
  const asDate = new Date(effectiveAt)
  if (!effectiveAt || Number.isNaN(asDate.getTime())) {
    return { success: false, message: "적용 시각 형식이 올바르지 않습니다." }
  }

  const current = await readCurrentValue({ entityType, entityId, fieldName })
  if (!current) return { success: false, message: "대상을 찾을 수 없습니다." }

  try {
    await supabaseInsert("price_schedules", {
      entity_type: entityType,
      entity_id: entityId,
      entity_display_name: current.displayName || entityId,
      field_name: fieldName,
      current_value: current.currentValue,
      scheduled_value: scheduledValue,
      status: "pending",
      effective_at: asDate.toISOString(),
      created_by: params.createdBy || null,
      category: current.category || null,
      category_main: current.categoryMain || null,
    })
    return { success: true }
  } catch (e) {
    if (isMissingPriceSchedulesTableError(e)) {
      return { success: false, message: "price_schedules 테이블이 없어 저장할 수 없습니다." }
    }
    return { success: false, message: e instanceof Error ? e.message : "예약 저장 실패" }
  }
}

export async function runDuePriceSchedules(now: Date = new Date()): Promise<{
  success: boolean
  appliedCount: number
  failedCount: number
  message?: string
}> {
  const nowUtc = now.toISOString()
  let rows: PriceScheduleRow[] = []
  try {
    rows = (await supabaseSelectFilter(
      "price_schedules",
      `status=eq.pending&effective_at=lte.${encodeURIComponent(nowUtc)}`,
      { limit: 300, order: "effective_at.asc,id.asc" }
    )) as PriceScheduleRow[] | null || []
  } catch (e) {
    if (isMissingPriceSchedulesTableError(e)) {
      console.warn("runDuePriceSchedules: price_schedules table missing, skip")
      return { success: true, appliedCount: 0, failedCount: 0, message: "price_schedules 테이블 없음 (건너뜀)" }
    }
    return { success: false, appliedCount: 0, failedCount: 0, message: e instanceof Error ? e.message : "조회 실패" }
  }

  if (!rows.length) {
    return { success: true, appliedCount: 0, failedCount: 0 }
  }

  let appliedCount = 0
  let failedCount = 0
  for (const row of rows) {
    try {
      const entityId = String(row.entity_id || "").trim()
      const fieldName = String(row.field_name || "").trim()
      const targetValue = Number(row.scheduled_value)
      if (!entityId || !fieldName || !Number.isFinite(targetValue)) {
        throw new Error("유효하지 않은 예약 레코드")
      }
      const current = await readCurrentValue({
        entityType: row.entity_type,
        entityId,
        fieldName,
      })
      if (!current) throw new Error("대상을 찾을 수 없음")
      if (row.entity_type === "item") {
        await supabaseUpdateByFilter("items", `code=eq.${encodeURIComponent(entityId)}`, { [fieldName]: targetValue })
      } else {
        await supabaseUpdateByFilter("pos_menus", `id=eq.${encodeURIComponent(entityId)}`, { [fieldName]: targetValue })
      }
      await recordPriceChange({
        entityType: row.entity_type === "item" ? "item" : "pos_menu",
        entityId,
        entityDisplayName: current.displayName || row.entity_display_name || entityId,
        fieldName,
        oldValue: current.currentValue,
        newValue: targetValue,
        changedBy: `price_schedule:${row.created_by || "system"}`,
        category: current.category,
        categoryMain: current.categoryMain,
      })
      await supabaseUpdateByFilter("price_schedules", `id=eq.${row.id}`, {
        status: "applied",
        applied_at: nowIso(),
        failed_reason: null,
      })
      appliedCount++
    } catch (e) {
      failedCount++
      try {
        await supabaseUpdateByFilter("price_schedules", `id=eq.${row.id}`, {
          status: "failed",
          failed_reason: (e instanceof Error ? e.message : String(e)).slice(0, 500),
        })
      } catch {
        // ignore
      }
    }
  }
  return { success: true, appliedCount, failedCount }
}
