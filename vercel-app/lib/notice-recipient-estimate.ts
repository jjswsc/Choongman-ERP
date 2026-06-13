import type { BroadcastTargetPayload } from '@/lib/broadcast-target-selection'
import { employeeReceivesBroadcast, parseTargetRecipientKeys } from '@/lib/broadcast-notice-target'

export type NoticeEmpRow = {
  store: string
  name: string
  job: string
  role: string
  resignDate: string
}

export function isActiveEmployeeRow(e: NoticeEmpRow): boolean {
  if (!e.name?.trim()) return false
  if (e.resignDate?.trim()) return false
  const st = e.store?.trim()
  if (!st || st === '매장명' || st === 'Store') return false
  return true
}

export function estimateNoticeRecipientCount(
  employees: NoticeEmpRow[],
  payload: BroadcastTargetPayload
): number {
  if (payload.targetRecipients && payload.targetRecipients.length > 0) {
    return payload.targetRecipients.filter((r) => r.store?.trim() && r.name?.trim()).length
  }
  const row = {
    target_store: payload.targetStore,
    target_role: payload.targetRole,
    target_permission_group: payload.targetPermissionGroup || null,
    target_recipients: null,
  }
  let count = 0
  for (const e of employees) {
    if (!isActiveEmployeeRow(e)) continue
    if (
      employeeReceivesBroadcast(
        { store: e.store, name: e.name, job: e.job, role: e.role || '' },
        row
      )
    ) {
      count += 1
    }
  }
  return count
}

export function listNoticeRecipientKeys(
  employees: NoticeEmpRow[],
  payload: BroadcastTargetPayload
): string[] {
  if (payload.targetRecipients && payload.targetRecipients.length > 0) {
    return payload.targetRecipients
      .filter((r) => r.store?.trim() && r.name?.trim())
      .map((r) => `${r.store.trim()}|${r.name.trim()}`)
  }
  const row = {
    target_store: payload.targetStore,
    target_role: payload.targetRole,
    target_permission_group: payload.targetPermissionGroup || null,
    target_recipients: null,
  }
  const keys: string[] = []
  for (const e of employees) {
    if (!isActiveEmployeeRow(e)) continue
    if (
      employeeReceivesBroadcast(
        { store: e.store, name: e.name, job: e.job, role: e.role || '' },
        row
      )
    ) {
      keys.push(`${e.store}|${e.name}`)
    }
  }
  return keys
}

export function parseNoticeAttachments(raw: unknown): Array<{ name: string; mime: string; url: string }> {
  if (raw == null || raw === '') return []
  try {
    const parsed =
      typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((a) => a && typeof a === 'object' && 'url' in a)
      .map((a: { name?: string; mime?: string; url?: string }) => ({
        name: String(a.name ?? 'file').trim() || 'file',
        mime: String(a.mime ?? 'application/octet-stream').trim(),
        url: String(a.url ?? '').trim(),
      }))
      .filter((a) => a.url.length > 0)
  } catch {
    return []
  }
}

export function buildTargetRecipientsJson(
  payload: BroadcastTargetPayload,
  employees: NoticeEmpRow[]
): string | null {
  if (payload.targetRecipients && payload.targetRecipients.length > 0) {
    const list = payload.targetRecipients
      .filter((r) => r.store?.trim() && r.name?.trim())
      .map((r) => `${r.store.trim()}|${r.name.trim()}`)
    return list.length > 0 ? JSON.stringify(list) : null
  }
  const keys = listNoticeRecipientKeys(employees, payload)
  return keys.length > 0 ? JSON.stringify(keys) : null
}

export function unreadRecipientKeysFromDetail(
  allKeys: string[],
  readRows: { store?: string; name?: string; status?: string }[]
): string[] {
  const readSet = new Set<string>()
  for (const r of readRows) {
    const st = String(r.status || '').trim()
    if (/^(확인|Read|확인함)$/i.test(st)) {
      readSet.add(`${String(r.store || '').trim()}|${String(r.name || '').trim()}`)
    }
  }
  return allKeys.filter((k) => !readSet.has(k))
}
