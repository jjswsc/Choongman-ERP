'use client'

import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'
import {
  claimKitchenPrintJob,
  claimTableQrPrintJob,
  markKitchenPrintJob,
  type PosKitchenPrintJobClaim,
  type PosOrder,
  type PosTableQrPrintJobClaim,
} from '@/lib/api-client'
import {
  printKitchenForOrder,
  type PosMainDeviceAutoprintCtx,
} from '@/lib/pos-main-device-autoprint'
import { printQrTableThermalSlip } from '@/lib/print-qr-table-thermal-slip'
import { tableQrPayloadFromPrintJob } from '@/lib/pos-table-qr-print-job'
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

async function printClaimedTableQrJob(
  job: PosTableQrPrintJobClaim,
  ctx: PosMainDeviceAutoprintCtx
): Promise<void> {
  const payload = tableQrPayloadFromPrintJob(job.payload_json)
  if (!payload) {
    await markKitchenPrintJob({ jobId: job.id, status: 'printed' })
    return
  }
  try {
    await printQrTableThermalSlip({
      tableName: payload.tableName,
      url: payload.url,
      storeLabel: payload.storeLabel || ctx.storeCode,
      scanTh: payload.scanTh,
      scanEn: payload.scanEn,
      printerSettings: ctx.printerSettings,
    })
    await markKitchenPrintJob({ jobId: job.id, status: 'printed' })
    ctx.logPosPrintDebug?.('table_qr_job_printed', { jobId: job.id, tableName: payload.tableName })
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e || 'print_failed')
    await markKitchenPrintJob({ jobId: job.id, status: 'failed', reason: reason.slice(0, 500) })
    console.error('table QR print job:', e)
  }
}

function createDrainLane(opts: {
  cancelled: () => boolean
  runBatch: () => Promise<void>
  pokeDelaysMs?: readonly number[]
}): { poke: () => void; drain: () => Promise<void>; dispose: () => void } {
  let inFlight = false
  let pending = false
  const pokeTimers: number[] = []
  const dispose = () => {
    while (pokeTimers.length) {
      const id = pokeTimers.pop()
      if (id != null) window.clearTimeout(id)
    }
  }
  const drain = async () => {
    if (opts.cancelled()) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (inFlight) {
      pending = true
      return
    }
    inFlight = true
    try {
      await opts.runBatch()
    } finally {
      inFlight = false
      if (!opts.cancelled() && pending) {
        pending = false
        void drain()
      }
    }
  }
  const delays = opts.pokeDelaysMs ?? MAIN_POS_KITCHEN_JOB_POKE_RETRY_MS
  const poke = () => {
    dispose()
    for (const delay of delays) {
      pokeTimers.push(
        window.setTimeout(() => {
          void drain()
        }, delay)
      )
    }
  }
  return { poke, drain, dispose }
}

/**
 * QR/원격 주문의 pos_print_jobs 를 메인 POS가 바로 claim·인쇄.
 * 테이블 QR(receipt)과 주방을 **별도 inFlight**로 돌려, 배달·주방 인쇄 중에도 QR이 대기하지 않음.
 * INSERT Realtime poke가 1차(타입별). 안전망 폴링은 **타이머 1개**(30초, 채널 장애 시 5초)로 양쪽 drain.
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

  const storeCodesKey = (opts.storeCodes || []).join('|')

  useEffect(() => {
    if (!opts.enabled || !opts.storeCode) {
      drainNowRef.current = () => {}
      return
    }
    let cancelled = false
    const isCancelled = () => cancelled
    const workerId = getKitchenPrintWorkerId(opts.storeCode)

    const tableQrLane = createDrainLane({
      cancelled: isCancelled,
      pokeDelaysMs: MAIN_POS_KITCHEN_JOB_POKE_RETRY_MS,
      runBatch: async () => {
        const ctx = opts.autoprintCtxRef.current
        if (!ctx) return
        try {
          for (let i = 0; i < MAIN_POS_KITCHEN_JOB_DRAIN_MAX; i += 1) {
            if (cancelled) return
            const qrRes = await claimTableQrPrintJob({ storeCode: opts.storeCode, workerId })
            const qrJob = qrRes.success ? qrRes.job : null
            if (!qrJob?.id) break
            await printClaimedTableQrJob(qrJob, ctx)
          }
        } catch (e) {
          console.error('table QR print job drain:', e)
        }
      },
    })

    const kitchenLane = createDrainLane({
      cancelled: isCancelled,
      pokeDelaysMs: MAIN_POS_KITCHEN_JOB_POKE_RETRY_MS,
      runBatch: async () => {
        if (!opts.kitchenOnOrder) return
        const ctx = opts.autoprintCtxRef.current
        if (!ctx) return
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
        }
      },
    })

    const pokeAll = () => {
      tableQrLane.poke()
      if (opts.kitchenOnOrder) kitchenLane.poke()
    }
    drainNowRef.current = pokeAll
    pokeAll()

    let jobsInsertHealthy = true
    const jobsChannel = subscribePosPrintJobsInsert(
      (meta) => {
        if (cancelled) return
        if (meta.jobType === 'receipt') tableQrLane.poke()
        else if (meta.jobType === 'kitchen' && opts.kitchenOnOrder) kitchenLane.poke()
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

    /** 안전망은 타이머 1개 — QR·주방을 같은 틱에 병렬 drain(inFlight는 레인별 유지) */
    let safetyPollTimer = 0
    const drainSafetyNet = () => {
      if (cancelled || opts.pauseIntervalPollRef?.current) return
      void tableQrLane.drain()
      if (opts.kitchenOnOrder) void kitchenLane.drain()
    }
    const scheduleSafetyPoll = () => {
      if (cancelled) return
      const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      const paused = Boolean(opts.pauseIntervalPollRef?.current) || hidden
      const delayMs = paused
        ? MAIN_POS_KITCHEN_JOB_POLL_PAUSED_MS
        : resolveKitchenPrintJobPollMs({ jobsInsertChannelHealthy: jobsInsertHealthy })
      safetyPollTimer = window.setTimeout(() => {
        drainSafetyNet()
        scheduleSafetyPoll()
      }, delayMs)
    }
    scheduleSafetyPoll()

    const onVisibility = () => {
      if (cancelled) return
      window.clearTimeout(safetyPollTimer)
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        drainSafetyNet()
      }
      scheduleSafetyPoll()
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }

    return () => {
      cancelled = true
      drainNowRef.current = () => {}
      window.clearTimeout(safetyPollTimer)
      tableQrLane.dispose()
      kitchenLane.dispose()
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
