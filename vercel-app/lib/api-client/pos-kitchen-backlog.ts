import { apiFetch } from '@/lib/api/fetch'
import type { PosKitchenPrintJobClaim } from '@/lib/api-client/pos-orders'

export async function getKitchenPrintBacklogCount(storeCode: string): Promise<number> {
  const res = await apiFetch('/api/pos/kitchen-backlog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ storeCode }),
  })
  if (!res.ok) return 0
  const j = (await res.json().catch(() => null)) as { success?: boolean; count?: number } | null
  return j?.success ? Math.max(0, Math.floor(Number(j.count) || 0)) : 0
}

/** 밀린 주방 job 1건 claim (오래된 순) — 직원이 출력에 동의한 경우만 */
export async function claimKitchenPrintBacklogJob(params: {
  storeCode: string
  workerId: string
}): Promise<PosKitchenPrintJobClaim | null> {
  const res = await apiFetch('/api/posPrintJobs/claimKitchen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...params, includeBacklog: true }),
  })
  const j = (await res.json().catch(() => null)) as { success?: boolean; job?: PosKitchenPrintJobClaim | null } | null
  return j?.success ? (j.job ?? null) : null
}
