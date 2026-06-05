import { extractGrabOrderIdFromMemo } from '@/lib/grab-order-memo'
import { listGrabPartnerStoreCodeRepairs } from '@/lib/grab-store-map-env'
import { supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'

type PosOrderRow = {
  id?: number
  store_code?: string
  memo?: string
  status?: string
  delivery_app_code?: string
}

export type GrabPosOrderStoreCodeRepairResult = {
  dryRun: boolean
  repairs: Array<{ from: string; to: string }>
  scanned: number
  updated: number
  skipped: number
  failed: number
  details: string[]
}

function isGrabPosOrderRow(row: PosOrderRow): boolean {
  const memo = String(row.memo ?? '')
  if (extractGrabOrderIdFromMemo(memo)) return true
  return String(row.delivery_app_code ?? '').trim().toLowerCase() === 'grab'
}

export async function repairGrabPosOrderStoreCodes(params: {
  days: number
  limit: number
  dryRun: boolean
  actor?: string
}): Promise<GrabPosOrderStoreCodeRepairResult> {
  const repairs = listGrabPartnerStoreCodeRepairs()
  const details: string[] = []
  let scanned = 0
  let updated = 0
  let skipped = 0
  let failed = 0

  if (!repairs.length) {
    return {
      dryRun: params.dryRun,
      repairs,
      scanned: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      details: ['no_partner_store_repairs_in_env'],
    }
  }

  const sinceIso = new Date(Date.now() - params.days * 86400_000).toISOString()
  const statusFilter = 'status=in.(pending,cooking,preparing,ready,paid,completed)'

  for (const pair of repairs) {
    const filters = [
      statusFilter,
      `created_at=gte.${encodeURIComponent(sinceIso)}`,
      `store_code=eq.${encodeURIComponent(pair.from)}`,
    ]
    const rows = (await supabaseSelectFilter('pos_orders', filters.join('&'), {
      limit: params.limit,
      order: 'created_at.desc',
      select: 'id,store_code,memo,status,delivery_app_code',
    })) as PosOrderRow[] | null

    for (const row of rows || []) {
      scanned += 1
      const id = Number(row.id ?? 0)
      if (!id) {
        skipped += 1
        continue
      }
      if (!isGrabPosOrderRow(row)) {
        skipped += 1
        details.push(`skip#${id}:not_grab`)
        continue
      }
      if (String(row.store_code ?? '').trim() === pair.to) {
        skipped += 1
        continue
      }

      try {
        if (!params.dryRun) {
          const stamp = `[GRAB_STORE_REPAIR ${new Date().toISOString()}${params.actor ? ` ${params.actor}` : ''}] ${pair.from} -> ${pair.to}`
          const memo = String(row.memo ?? '')
          const nextMemo = memo ? `${memo}\n${stamp}` : stamp
          await supabaseUpdateByFilter('pos_orders', `id=eq.${id}`, {
            store_code: pair.to,
            memo: nextMemo,
          })
        }
        updated += 1
        details.push(`${params.dryRun ? 'would' : 'ok'}#${id}:${pair.from}->${pair.to}`)
      } catch (e) {
        failed += 1
        details.push(`fail#${id}:${String(e instanceof Error ? e.message : e)}`)
      }
    }
  }

  return {
    dryRun: params.dryRun,
    repairs,
    scanned,
    updated,
    skipped,
    failed,
    details: details.slice(0, 80),
  }
}
