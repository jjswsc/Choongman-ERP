/**
 * 개선 과제 일정 대상 — 공지 BroadcastTarget 과 동일 규칙.
 * 대상이 비어 있거나 「전체」만이면 브로드캐스트하지 않고 담당자(owner)만 쓴다.
 */
import { employeeIsTargetedForRow, type BroadcastTargetRow } from "@/lib/broadcast-notice-target"
import type { BroadcastTargetPayload } from "@/lib/broadcast-target-selection"
import { isActiveEmployeeRow, type NoticeEmpRow } from "@/lib/notice-recipient-estimate"

export type StoreActionAudienceFields = {
  targetStore: string
  targetRole: string
  targetPermissionGroup: string
  targetRecipients: string
}

export function emptyStoreActionAudience(): StoreActionAudienceFields {
  return {
    targetStore: "",
    targetRole: "",
    targetPermissionGroup: "",
    targetRecipients: "",
  }
}

export function storeActionAudienceFromPayload(payload: BroadcastTargetPayload): StoreActionAudienceFields {
  const recipients =
    payload.targetRecipients && payload.targetRecipients.length > 0
      ? JSON.stringify(
          payload.targetRecipients
            .filter((r) => r.store?.trim() && r.name?.trim())
            .map((r) => `${r.store.trim()}|${r.name.trim()}`)
        )
      : ""
  return {
    targetStore: String(payload.targetStore || "").trim() === "전체" ? "" : String(payload.targetStore || "").trim(),
    targetRole: String(payload.targetRole || "").trim() === "전체" ? "" : String(payload.targetRole || "").trim(),
    targetPermissionGroup: String(payload.targetPermissionGroup || "").trim(),
    targetRecipients: recipients,
  }
}

/** 저장용 fields → 브로드캐스트할지 (전체만 고른 상태는 false) */
export function isStoreActionAudienceBroadcast(fields: StoreActionAudienceFields): boolean {
  if (String(fields.targetRecipients || "").trim()) {
    try {
      const j = JSON.parse(String(fields.targetRecipients)) as unknown
      if (Array.isArray(j) && j.some((x) => typeof x === "string" && String(x).includes("|"))) return true
    } catch {
      /* ignore */
    }
  }
  const store = String(fields.targetStore || "").trim()
  const role = String(fields.targetRole || "").trim()
  const perm = String(fields.targetPermissionGroup || "").trim()
  if (store && store !== "전체" && store.toLowerCase() !== "all") return true
  if (role && role !== "전체" && role.toLowerCase() !== "all") return true
  if (perm) return true
  return false
}

export function storeActionAudienceToBroadcastRow(fields: StoreActionAudienceFields): BroadcastTargetRow {
  return {
    target_store: String(fields.targetStore || "").trim() || "전체",
    target_role: String(fields.targetRole || "").trim() || "전체",
    target_permission_group: String(fields.targetPermissionGroup || "").trim() || null,
    target_recipients: String(fields.targetRecipients || "").trim() || null,
  }
}

export type StoreActionAudienceEmp = NoticeEmpRow & { id: number }

/** 일정에 넣을 대상 직원 (담당자 제외 가능) */
export function listStoreActionAudienceEmployees(
  employees: StoreActionAudienceEmp[],
  fields: StoreActionAudienceFields,
  opts?: { excludeName?: string; excludeUserId?: string }
): StoreActionAudienceEmp[] {
  if (!isStoreActionAudienceBroadcast(fields)) return []
  const row = storeActionAudienceToBroadcastRow(fields)
  const exName = String(opts?.excludeName || "")
    .trim()
    .toLowerCase()
  const exId = String(opts?.excludeUserId || "").trim()
  const out: StoreActionAudienceEmp[] = []
  for (const e of employees) {
    if (!isActiveEmployeeRow(e)) continue
    if (exId && String(e.id) === exId) continue
    if (exName && e.name.trim().toLowerCase() === exName) continue
    if (
      !employeeIsTargetedForRow(e.store, e.name, e.job, e.role || "", row)
    ) {
      continue
    }
    out.push(e)
  }
  return out
}

export function employeeReceivesStoreActionAudience(
  emp: { store: string; name: string; job?: string; role?: string },
  a: {
    targetStore?: string
    targetRole?: string
    targetPermissionGroup?: string
    targetRecipients?: string
  }
): boolean {
  const fields = {
    targetStore: a.targetStore || "",
    targetRole: a.targetRole || "",
    targetPermissionGroup: a.targetPermissionGroup || "",
    targetRecipients: a.targetRecipients || "",
  }
  if (!isStoreActionAudienceBroadcast(fields)) return false
  const row = storeActionAudienceToBroadcastRow(fields)
  return employeeIsTargetedForRow(
    emp.store,
    emp.name,
    String(emp.job || ""),
    String(emp.role || ""),
    row
  )
}
