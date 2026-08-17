import {
  supabaseInsertIgnoreDuplicates,
  supabaseRpc,
  supabaseSelectFilter,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'
import { kitchenLinesFromPrintJobPayload } from '@/lib/pos-kitchen-print-job-worker'

type EnqueueKitchenPrintJobInput = {
  storeCode: string
  orderId: number
  orderNo?: string | null
  station?: number | null
  source?: string | null
  dedupeKey?: string | null
  payload?: Record<string, unknown> | null
}

function isMissingPrintJobsTableError(e: unknown): boolean {
  const msg = String(e ?? '').toLowerCase()
  return msg.includes('pos_print_jobs') || msg.includes('42p01')
}

function normalizeStoreCode(raw: unknown): string {
  return String(raw ?? '').trim()
}

function normalizeOrderId(raw: unknown): number {
  const n = Math.floor(Number(raw))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export async function enqueueKitchenPrintJob(input: EnqueueKitchenPrintJobInput): Promise<void> {
  const storeCode = normalizeStoreCode(input.storeCode)
  const orderId = normalizeOrderId(input.orderId)
  if (!storeCode || !orderId) return

  const dedupeKey =
    String(input.dedupeKey ?? '').trim() || `order:${orderId}:kitchen:${Number(input.station || 0) || 0}`

  const payload_json = {
    source: String(input.source || '').trim() || null,
    ...(input.payload || {}),
  }

  try {
    await supabaseRpc('enqueue_pos_print_job', {
      p_store_code: storeCode,
      p_order_id: orderId,
      p_order_no: String(input.orderNo ?? '').trim() || null,
      p_job_type: 'kitchen',
      p_station:
        input.station != null && Number.isFinite(Number(input.station))
          ? Math.max(0, Math.min(3, Math.trunc(Number(input.station))))
          : null,
      p_status: 'queued',
      p_dedupe_key: dedupeKey,
      p_payload_json: payload_json,
    })
    return
  } catch (rpcErr) {
    const rpcMsg = String(rpcErr ?? '').toLowerCase()
    if (!/enqueue_pos_print_job|42883|pgrst202|does not exist|could not find/i.test(rpcMsg)) {
      if (isMissingPrintJobsTableError(rpcErr)) return
      throw rpcErr
    }
  }

  try {
    await supabaseInsertIgnoreDuplicates(
      'pos_print_jobs',
      {
        store_code: storeCode,
        order_id: orderId,
        order_no: String(input.orderNo ?? '').trim() || null,
        job_type: 'kitchen',
        station:
          input.station != null && Number.isFinite(Number(input.station))
            ? Math.max(0, Math.min(3, Math.trunc(Number(input.station))))
            : null,
        status: 'queued',
        dedupe_key: dedupeKey,
        payload_json,
      },
      'dedupe_key'
    )
  } catch (e) {
    const msg = String(e ?? '').toLowerCase()
    if (msg.includes('duplicate key value') && msg.includes('dedupe_key')) return
    if (isMissingPrintJobsTableError(e)) return
    throw e
  }
}

export async function claimQueuedKitchenPrintJob(params: {
  storeCode: string
  workerId: string
}): Promise<{ id: number; order_id: number; payload_json: Record<string, unknown> | null } | null> {
  const storeCode = normalizeStoreCode(params.storeCode)
  const workerId = String(params.workerId ?? '').trim()
  if (!storeCode || !workerId) return null
  try {
    const rows = (await supabaseSelectFilter(
      'pos_print_jobs',
      `store_code=eq.${encodeURIComponent(storeCode)}&status=eq.queued&job_type=eq.kitchen`,
      {
        limit: 25,
        order: 'created_at.asc',
        select: 'id,order_id,payload_json',
      }
    )) as { id?: number; order_id?: number; payload_json?: Record<string, unknown> | null }[] | null
    const skipIds: number[] = []
    let picked: { id?: number; order_id?: number; payload_json?: Record<string, unknown> | null } | undefined
    for (const row of rows || []) {
      const id = Number(row.id || 0)
      if (!id) continue
      if (kitchenLinesFromPrintJobPayload(row.payload_json).length === 0) {
        skipIds.push(id)
        continue
      }
      picked = row
      break
    }
    if (skipIds.length) {
      await supabaseUpdateByFilter(
        'pos_print_jobs',
        `id=in.(${skipIds.join(',')})&status=eq.queued`,
        {
          status: 'printed',
          printed_at: new Date().toISOString(),
          last_error: 'skipped_no_kitchen_lines',
        }
      )
    }
    if (!picked?.id) return null
    await supabaseUpdateByFilter('pos_print_jobs', `id=eq.${Number(picked.id)}&status=eq.queued`, {
      status: 'claimed',
      claimed_by: workerId,
      claimed_at: new Date().toISOString(),
      attempt_count: 1,
    })
    const verify = (await supabaseSelectFilter(
      'pos_print_jobs',
      `id=eq.${Number(picked.id)}`,
      {
        limit: 1,
        select: 'id,status,claimed_by',
      }
    )) as { id?: number; status?: string; claimed_by?: string | null }[] | null
    const claimed = verify?.[0]
    if (!claimed?.id) return null
    if (String(claimed.status ?? '').trim() !== 'claimed') return null
    if (String(claimed.claimed_by ?? '').trim() !== workerId) return null
    return {
      id: Number(picked.id),
      order_id: Number(picked.order_id || 0),
      payload_json:
        picked.payload_json && typeof picked.payload_json === 'object' ? picked.payload_json : null,
    }
  } catch (e) {
    if (isMissingPrintJobsTableError(e)) return null
    throw e
  }
}

export async function markKitchenPrintJobPrinted(jobId: number): Promise<void> {
  if (!Number.isFinite(Number(jobId)) || Number(jobId) <= 0) return
  try {
    await supabaseUpdateByFilter('pos_print_jobs', `id=eq.${Math.floor(Number(jobId))}`, {
      status: 'printed',
      printed_at: new Date().toISOString(),
      last_error: null,
    })
  } catch (e) {
    if (isMissingPrintJobsTableError(e)) return
    throw e
  }
}

export async function markKitchenPrintJobFailed(jobId: number, reason: string): Promise<void> {
  if (!Number.isFinite(Number(jobId)) || Number(jobId) <= 0) return
  try {
    await supabaseUpdateByFilter('pos_print_jobs', `id=eq.${Math.floor(Number(jobId))}`, {
      status: 'failed',
      failed_at: new Date().toISOString(),
      last_error: String(reason || '').trim().slice(0, 500) || 'print_failed',
    })
  } catch (e) {
    if (isMissingPrintJobsTableError(e)) return
    throw e
  }
}
