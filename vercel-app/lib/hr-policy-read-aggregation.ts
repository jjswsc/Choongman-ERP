/**
 * 인사 규정 열람·확인 집계 — getMyHrPolicies·getHrPolicyReaderStats
 */
import { isNoticeReadStatus } from '@/lib/notice-read-status'
import { employeeReceivesBroadcast, parseTargetRecipientKeys } from '@/lib/broadcast-notice-target'
import type { EmpRow, NoticeForAggregation } from '@/lib/notice-read-aggregation'

export type HrPolicyForAggregation = Pick<
  NoticeForAggregation,
  'id' | 'title' | 'content' | 'target_store' | 'target_role' | 'target_permission_group' | 'target_recipients'
> & { content_version?: number }

const empKey = (store: string, name: string) => `${String(store).trim()}|${String(name).trim()}`

const readKey = (policyId: number, store: string, name: string) =>
  `${policyId}::${String(store).trim()}::${String(name).trim()}`

type ReadRow = {
  policy_id: number
  store?: string
  name?: string
  status?: string
  acknowledged_version?: number
}

/**
 * 직원별: 대상 규정 수 / 현재 버전에 대한 확인(acknowledged_version)
 */
export function aggregateHrPolicyReadStats(
  policies: HrPolicyForAggregation[],
  employees: EmpRow[],
  readRows: ReadRow[]
): Map<string, { store: string; name: string; job: string; targeted: number; confirmed: number }> {
  const readByKey = new Map<string, { st: string; v: number }>()
  for (const r of readRows) {
    const pid = r.policy_id
    const s = String(r.store || '').trim()
    const n = String(r.name || '').trim()
    if (!pid || !s || !n) continue
    const k = readKey(pid, s, n)
    const st = String(r.status || '').trim()
    const v = Math.floor(Number(r.acknowledged_version ?? 0)) || 0
    readByKey.set(k, { st, v })
  }

  const agg = new Map<
    string,
    { store: string; name: string; job: string; targeted: number; confirmed: number }
  >()

  const byKey = new Map<string, EmpRow>()
  for (const e of employees) {
    if (!e.name) continue
    if (e.resignDate && e.resignDate !== '') continue
    if (!e.store || e.store === '매장명' || e.store === 'Store') continue
    byKey.set(empKey(e.store, e.name), e)
  }

  const getAgg = (store: string, name: string) => {
    const k0 = empKey(store, name)
    const ex = byKey.get(k0)
    if (!ex) return null
    const j = (ex?.job || '').trim() || '—'
    let row = agg.get(k0)
    if (!row) {
      row = { store, name, job: j, targeted: 0, confirmed: 0 }
      agg.set(k0, row)
    } else if (j !== '—' && row.job === '—') row.job = j
    return row
  }

  for (const p of policies) {
    const cv = Math.max(1, Math.floor(Number(p.content_version ?? 1)) || 1)
    const n = p as HrPolicyForAggregation
    const specific = parseTargetRecipientKeys(n.target_recipients)
    if (specific.length > 0) {
      for (const t of specific) {
        const a = getAgg(t.store, t.name)
        if (!a) continue
        a.targeted += 1
        const rd = readByKey.get(readKey(n.id, t.store, t.name))
        if (rd && isNoticeReadStatus(rd.st) && (rd.v || 0) >= cv) a.confirmed += 1
      }
    } else {
      for (const e of byKey.values()) {
        if (
          !employeeReceivesBroadcast(
            { store: e.store, name: e.name, job: e.job, role: e.role || '' },
            n
          )
        )
          continue
        const a = getAgg(e.store, e.name)
        if (!a) continue
        a.targeted += 1
        const rd = readByKey.get(readKey(n.id, e.store, e.name))
        if (rd && isNoticeReadStatus(rd.st) && (rd.v || 0) >= cv) a.confirmed += 1
      }
    }
  }

  for (const k of [...agg.keys()]) {
    const a = agg.get(k)!
    if (a.targeted === 0) agg.delete(k)
  }

  return agg
}
