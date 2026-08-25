'use client'

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import {
  claimKitchenPrintJob,
  markKitchenPrintJob,
  type PosKitchenPrintJobClaim,
  type PosOrder,
} from '@/lib/api-client'
import {
  printKitchenForOrder,
  type PosMainDeviceAutoprintCtx,
} from '@/lib/pos-main-device-autoprint'
import {
  getKitchenPrintWorkerId,
  kitchenLinesFromPrintJobPayload,
  kitchenPrintJobOrderFieldsFromPayload,
  MAIN_POS_KITCHEN_JOB_DRAIN_MAX,
  MAIN_POS_KITCHEN_JOB_POLL_PAUSED_MS,
  MAIN_POS_KITCHEN_JOB_POKE_RETRY_MS,
  resolveKitchenPrintJobDedupeKey,
  resolveKitchenPrintJobPollMs,
} from '@/lib/pos-kitchen-print-job-worker'
import { subscribePosPrintJobsInsert } from '@/lib/supabase-client'

async function printClaimedKitchenJob(
  job: PosKitchenPrintJobClaim,
  ctx: PosMainDeviceAutoprintCtx
): Promise<void> {
  const orderId = Number(job.order_id || 0)
  if (!Number.isFinite(orderId) || orderId <= 0) {
    await markKitchenPrintJob({ jobId: job.id, status: 'failed', reason: 'invalid_order_id' })
    return
  }
  const payload = job.payload_json
  const kitchenLines = kitchenLinesFromPrintJobPayload(payload)
  if (kitchenLines.length === 0) {
    await markKitchenPrintJob({ jobId: job.id, status: 'printed' })
    ctx.logPosPrintDebug?.('kitchen_job_skip_no_lines', {
      orderId,
      jobId: job.id,
      action: String(payload?.action ?? ''),
    })
    return
  }
  const dedupeKey = resolveKitchenPrintJobDedupeKey(orderId, payload)
  if (!ctx.reserveKitchenAutoPrintKey(dedupeKey)) {
    await markKitchenPrintJob({ jobId: job.id, status: 'printed' })
    ctx.logPosPrintDebug?.('kitchen_job_skip_dedupe', { orderId, jobId: job.id, dedupeKey })
    return
  }
  try {
    const header = kitchenPrintJobOrderFieldsFromPayload(payload)
    const orderForKitchen = {
      id: orderId,
      orderNo: header.orderNo,
      storeCode: ctx.storeCode,
      orderType: header.orderType,
      tableName: header.tableName,
      memo: header.memo,
      items: kitchenLines as unknown as PosOrder['items'],
      guestCount: header.guestCount,
      deliveryAppCode: header.deliveryAppCode,
    } as PosOrder
    await printKitchenForOrder(orderForKitchen, ctx, { kitchenLines, dedupeKey })
    await markKitchenPrintJob({ jobId: job.id, status: 'printed' })
    ctx.logPosPrintDebug?.('kitchen_job_printed', { orderId, jobId: job.id, lines: kitchenLines.length })
    ctx.onRefetchStores?.('current')
  } catch (e) {
    ctx.releaseKitchenAutoPrintKey(dedupeKey)
    const reason = e instanceof Error ? e.message : String(e || 'print_failed')
    await markKitchenPrintJob({ jobId: job.id, status: 'failed', reason: reason.slice(0, 500) })
    console.error('kitchen print job:', e)
  }
}

/**
 * QR/원격 주문의 pos_print_jobs 를 메인 POS가 바로 claim·인쇄.
 * INSERT Realtime poke가 1차. 놓치면 15초(채널 장애 시 5초)마다 claim.
 * 오픈 전·마감 후·백그라운드 탭은 60초.
 */
export function usePosKitchenPrintJobWorker(opts: {
  enabled: boolean
  storeCode: string
  storeCodes?: string[]
  kitchenOnOrder: boolean
  autoprintCtxRef: MutableRefObject<PosMainDeviceAutoprintCtx | null>
  pauseIntervalPollRef?: MutableRefObject<boolean>
}): () => void {
  const drainNowRef = useRef<() => void>(() => {})
  const inFlightRef = useRef(false)
  const pendingDrainRef = useRef(false)

  const storeCodesKey = (opts.storeCodes || []).join('|')

  useEffect(() => {
    if (!opts.enabled || !opts.storeCode || !opts.kitchenOnOrder) {
      drainNowRef.current = () => {}
      return
    }
    let cancelled = false
    const workerId = getKitchenPrintWorkerId(opts.storeCode)
    const pokeTimers: number[] = []
    const clearPokeTimers = () => {
      while (pokeTimers.length) {
        const id = pokeTimers.pop()
        if (id != null) window.clearTimeout(id)
      }
    }

    const drain = async () => {
      if (cancelled) return
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (inFlightRef.current) {
        pendingDrainRef.current = true
        return
      }
      const ctx = opts.autoprintCtxRef.current
      if (!ctx) return
      inFlightRef.current = true
      try {
        for (let i = 0; i < MAIN_POS_KITCHEN_JOB_DRAIN_MAX; i += 1) {
          if (cancelled) return
          const res = await claimKitchenPrintJob({ storeCode: opts.storeCode, workerId })
          const job = res.success ? res.job : null
          if (!job?.id) break
          await printClaimedKitchenJob(job, ctx)
        }
      } catch (e) {
        console.error('kitchen print job drain:', e)
      } finally {
        inFlightRef.current = false
        if (!cancelled && pendingDrainRef.current) {
          pendingDrainRef.current = false
          void drain()
        }
      }
    }

    const poke = () => {
      clearPokeTimers()
      for (const delay of MAIN_POS_KITCHEN_JOB_POKE_RETRY_MS) {
        pokeTimers.push(
          window.setTimeout(() => {
            void drain()
          }, delay)
        )
      }
    }

    drainNowRef.current = poke
    poke()
    let jobsInsertHealthy = true
    const jobsChannel = subscribePosPrintJobsInsert(
      () => {
        if (!cancelled) poke()
      },
      {
        store: opts.storeCode,
        storeCodes: opts.storeCodes,
        onStatus: (status) => {
          jobsInsertHealthy = status === 'SUBSCRIBED'
        },
      }
    )
    if (!jobsChannel) jobsInsertHealthy = false
    let pollTimer = 0
    const scheduleNextPoll = () => {
      if (cancelled) return
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      const paused = Boolean(opts.pauseIntervalPollRef?.current) || hidden
      const delayMs = paused
        ? MAIN_POS_KITCHEN_JOB_POLL_PAUSED_MS
        : resolveKitchenPrintJobPollMs({ jobsInsertChannelHealthy: jobsInsertHealthy })
      pollTimer = window.setTimeout(() => {
        if (!cancelled && !opts.pauseIntervalPollRef?.current) void drain()
        scheduleNextPoll()
      }, delayMs)
    }
    scheduleNextPoll()
    const onVisibility = () => {
      if (cancelled) return
      window.clearTimeout(pollTimer)
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') void drain()
      scheduleNextPoll()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }

    return () => {
      cancelled = true
      drainNowRef.current = () => {}
      window.clearTimeout(pollTimer)
      clearPokeTimers()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibility)
      }
      void jobsChannel?.unsubscribe()
    }
  }, [
    opts.enabled,
    opts.storeCode,
    storeCodesKey,
    opts.kitchenOnOrder,
    opts.autoprintCtxRef,
    opts.pauseIntervalPollRef,
  ])

  return useCallback(() => {
    drainNowRef.current()
  }, [])
}
