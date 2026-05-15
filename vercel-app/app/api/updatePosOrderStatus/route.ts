import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'
import { supabaseSelectFilterStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'
import { getVerifiedAuth } from '@/lib/verify-auth'
import { writePosOrderAuditTrail } from '@/lib/pos-order-audit'
import { processPosStockDeduction, reversePosStockDeduction } from '@/lib/pos-stock-deduction'
import {
  hasJournalForSource,
  postPosOrderJournal,
  postPosOrderReversalJournal,
} from '@/lib/accounting-posting'
import {
  isPosCompletionStatus,
  isPosPaidLikeStatus,
  isPosReversalStatus,
  resolveBangkokAccountingDate,
} from '@/lib/pos-order-policy'
import { upsertPosVatLedgerDraft } from '@/lib/pos-ledger-drafts'
import { enqueueKitchenPrintJob } from '@/lib/pos-print-job-queue'
import { reserveRequestIdempotencyKey } from '@/lib/request-idempotency'
import {
  extractGrabOrderIdFromMemo,
  mergeGrabStateIntoFullMemo,
} from '@/lib/grab-order-memo'

const ALLOWED_STATUSES = ['pending', 'paid', 'cooking', 'ready', 'completed', 'cancelled', 'refunded']

type SideEffectStep = 'stock' | 'journal' | 'vat_draft' | 'reversal_stock' | 'reversal_journal'

function pushFailedStep(target: SideEffectStep[], step: SideEffectStep) {
  if (!target.includes(step)) target.push(step)
}

function hasPositivePaymentAmount(order: {
  payment_cash?: number
  payment_card?: number
  payment_qr?: number
  payment_other?: number
  payment_delivery_app?: number
}) {
  const total =
    Number(order.payment_cash ?? 0) +
    Number(order.payment_card ?? 0) +
    Number(order.payment_qr ?? 0) +
    Number(order.payment_other ?? 0) +
    Number(order.payment_delivery_app ?? 0)
  return total > 0
}

/** POS 주문 상태 변경 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const auth = await getVerifiedAuth(req)
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }
    const fromOfflineQueueSync =
      String(req.headers.get('x-cm-offline-queue-sync') ?? '').trim().toLowerCase() === '1'
    const idempotencyKey = String(req.headers.get('x-idempotency-key') ?? '').trim()
    const retrySideEffects = body.retrySideEffects === true || String(body.retrySideEffects ?? '') === '1'
    const id = body.id != null ? Number(body.id) : NaN
    const status = String(body.status ?? '').trim()
    const grabStateRaw = String(body.grabState ?? '').trim()
    const memoAppend = String(body.memoAppend ?? body.memo_append ?? '').trim()

    if (!id || isNaN(id)) {
      return NextResponse.json({ success: false, message: '주문 ID가 필요합니다.' }, { headers })
    }
    if (idempotencyKey) {
      const duplicated = await reserveRequestIdempotencyKey({
        scope: `update_pos_order_status:${id}`,
        key: idempotencyKey,
        payload: { id, status, source: fromOfflineQueueSync ? 'offline_queue' : 'api' },
      })
      if (duplicated) {
        return NextResponse.json({ success: true, noop: true, duplicate: true }, { headers })
      }
    }
    if (!ALLOWED_STATUSES.includes(status)) {
      return NextResponse.json({ success: false, message: '유효하지 않은 상태입니다.' }, { headers })
    }

    const existing = (await supabaseSelectFilterStrippingUnknownColumns(
      'pos_orders',
      `id=eq.${id}`,
      {
        limit: 1,
        select:
          'id,order_no,store_code,total,subtotal,vat,status,created_at,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app,created_by,memo,service_amt',
      },
      'updatePosOrderStatus'
    )) as {
      id?: number
      order_no?: string
      store_code?: string
      total?: number
      subtotal?: number
      vat?: number
      status?: string
      created_at?: string
      payment_cash?: number
      payment_card?: number
      payment_qr?: number
      payment_other?: number
      payment_delivery_app?: number
      service_amt?: number
      created_by?: string
      memo?: string
    }[] | null
    if (!existing?.length) {
      return NextResponse.json({ success: false, message: '주문을 찾을 수 없습니다.' }, { headers })
    }
    const prev = existing[0]
    const prevStatus = String(prev?.status ?? '').trim().toLowerCase()
    const nextStatus = String(status).trim().toLowerCase()
    const failedSideEffects: SideEffectStep[] = []

    if (prevStatus === nextStatus) {
      if (!retrySideEffects && !fromOfflineQueueSync) {
        return NextResponse.json({ success: true, noop: true }, { headers })
      }
      if (isPosCompletionStatus(nextStatus)) {
        const storeCode = String(prev?.store_code ?? '').trim()
        const salesDate = resolveBangkokAccountingDate(String(prev?.created_at ?? ''))
        if (storeCode) {
          try {
            const settings = (await supabaseSelectFilter(
              'pos_printer_settings',
              `store_code=eq.${encodeURIComponent(storeCode)}`,
              { limit: 1, select: 'auto_stock_deduction' }
            )) as { auto_stock_deduction?: boolean }[] | null
            if (settings?.[0]?.auto_stock_deduction) {
              await processPosStockDeduction(id)
            }
          } catch (e) {
            pushFailedStep(failedSideEffects, 'stock')
            console.error('processPosStockDeduction(retry):', e)
          }
        }
        const total = Number(prev?.total || 0)
        const vat = Number(prev?.vat || 0)
        const subtotal = Number(prev?.subtotal || Math.max(0, total - vat))
        const orderNo = String(prev?.order_no || `POS-${id}`)
        try {
          const alreadyPosted = await hasJournalForSource('pos_order', id)
          if (!alreadyPosted) {
            await postPosOrderJournal({
              posOrderId: id,
              salesDate,
              total,
              vatAmount: vat,
              serviceAmount: Number(prev?.service_amt || 0),
              paymentCash: Number(prev?.payment_cash || 0),
              paymentCard: Number(prev?.payment_card || 0),
              paymentQr: Number(prev?.payment_qr || 0),
              paymentOther: Number(prev?.payment_other || 0),
              paymentDeliveryApp: Number(prev?.payment_delivery_app || 0),
              storeName: storeCode || undefined,
              memo: 'POS 주문 완료 자동분개',
            })
          }
        } catch (postingErr) {
          pushFailedStep(failedSideEffects, 'journal')
          console.error('updatePosOrderStatus posting(retry):', postingErr)
        }
        try {
          await upsertPosVatLedgerDraft({
            posOrderId: id,
            orderNo,
            storeCode,
            createdAtIso: String(prev?.created_at ?? ''),
            subtotal,
            total,
            vatAmount: vat,
            createdBy: String(prev?.created_by ?? ''),
          })
        } catch (vatErr) {
          pushFailedStep(failedSideEffects, 'vat_draft')
          console.error('updatePosOrderStatus vat draft(retry):', vatErr)
        }
        try {
          await enqueueKitchenPrintJob({
            storeCode,
            orderId: id,
            orderNo: String(prev?.order_no || `POS-${id}`),
            source: 'updatePosOrderStatus_retry',
            dedupeKey: `order:${id}:kitchen:auto`,
            payload: {
              action: 'retry_side_effects',
              status: nextStatus,
            },
          })
        } catch (queueErr) {
          console.error('updatePosOrderStatus enqueueKitchenPrintJob(retry):', queueErr)
        }
      } else if (isPosReversalStatus(nextStatus) && hasPositivePaymentAmount(prev)) {
        const storeCode = String(prev?.store_code ?? '').trim()
        const salesDate = resolveBangkokAccountingDate(String(prev?.created_at ?? ''))
        try {
          await reversePosStockDeduction(id)
        } catch (e) {
          pushFailedStep(failedSideEffects, 'reversal_stock')
          console.error('reversePosStockDeduction(retry):', e)
        }
        try {
          await postPosOrderReversalJournal({
            posOrderId: id,
            salesDate,
            storeName: storeCode || undefined,
            memo: `POS 주문 ${nextStatus === 'refunded' ? '환불' : '취소'} 역분개`,
          })
        } catch (postingErr) {
          pushFailedStep(failedSideEffects, 'reversal_journal')
          console.error('updatePosOrderStatus reversal posting(retry):', postingErr)
        }
      }
      if (failedSideEffects.length > 0) {
        return NextResponse.json(
          {
            success: false,
            statusAlreadyApplied: true,
            retryAfterQueue: true,
            failedSideEffects,
            message: '상태는 이미 반영됐지만 후속 처리에 실패했습니다. 다시 시도해 주세요.',
          },
          { headers }
        )
      }
      return NextResponse.json({ success: true, noop: true }, { headers })
    }

    if (isPosReversalStatus(prevStatus) && isPosCompletionStatus(nextStatus)) {
      return NextResponse.json(
        { success: false, message: '취소/환불된 주문은 완료 상태로 되돌릴 수 없습니다.' },
        { status: 409, headers }
      )
    }
    if (isPosCompletionStatus(prevStatus) && !isPosCompletionStatus(nextStatus) && !isPosReversalStatus(nextStatus)) {
      // 오프라인 큐 재전송: 서버는 이미 completed 인데 큐에 paid 등 예전 단계 갱신만 남은 경우 → 큐 제거용 성공
      if (fromOfflineQueueSync) {
        return NextResponse.json(
          { success: true, noop: true, message: 'skip_stale_status_replay' },
          { headers }
        )
      }
      return NextResponse.json(
        { success: false, message: '완료 주문은 취소/환불 상태로만 변경할 수 있습니다.' },
        { status: 409, headers }
      )
    }

    const patch: Record<string, unknown> = { status }
    if (grabStateRaw) {
      const prevMemo = String(prev?.memo ?? '')
      const grabOrderId = extractGrabOrderIdFromMemo(prevMemo)
      if (grabOrderId) {
        const mergedMemo = mergeGrabStateIntoFullMemo(prevMemo, grabOrderId, grabStateRaw)
        if (mergedMemo && mergedMemo !== prevMemo) patch.memo = mergedMemo
      }
    }
    if (memoAppend && isPosReversalStatus(nextStatus)) {
      const stamp = `[ORDER_${nextStatus.toUpperCase()} ${new Date().toISOString()}] ${memoAppend.slice(0, 240)}`
      const baseMemo = String(patch.memo ?? prev?.memo ?? '').trim()
      patch.memo = baseMemo ? `${baseMemo}\n${stamp}` : stamp
    }

    await supabaseUpdate('pos_orders', id, patch)

    await writePosOrderAuditTrail({
      orderId: id,
      orderNo: String(prev?.order_no || `POS-${id}`),
      storeCode: String(prev?.store_code || '').trim() || null,
      actionType: 'update_status',
      source: fromOfflineQueueSync ? 'offline_queue' : 'api',
      actor: {
        name: String(auth?.name || body?.updatedBy || body?.createdBy || '').trim() || null,
        role: String(auth?.role || '').trim() || null,
        store: String(auth?.store || '').trim() || null,
        employeeCode: String(auth?.employeeCode || '').trim() || null,
        employeeId:
          auth?.employeeId != null && Number.isFinite(Number(auth.employeeId))
            ? Math.floor(Number(auth.employeeId))
            : null,
      },
      before: {
        status: prevStatus,
        memo: String(prev?.memo ?? ''),
      },
      after: {
        status: nextStatus,
        memo: String(patch.memo ?? prev?.memo ?? ''),
      },
      reason: memoAppend || null,
    })

    const storeCode = String(prev?.store_code ?? '').trim()
    const salesDate = resolveBangkokAccountingDate(String(prev?.created_at ?? ''))
    if (isPosCompletionStatus(nextStatus)) {
      if (storeCode) {
        try {
          const settings = (await supabaseSelectFilter(
            'pos_printer_settings',
            `store_code=eq.${encodeURIComponent(storeCode)}`,
            { limit: 1, select: 'auto_stock_deduction' }
          )) as { auto_stock_deduction?: boolean }[] | null
          if (settings?.[0]?.auto_stock_deduction) {
            await processPosStockDeduction(id)
          }
        } catch (e) {
          pushFailedStep(failedSideEffects, 'stock')
          console.error('processPosStockDeduction:', e)
        }
      }

      const total = Number(prev?.total || 0)
      const vat = Number(prev?.vat || 0)
      const subtotal = Number(prev?.subtotal || Math.max(0, total - vat))
      const orderNo = String(prev?.order_no || `POS-${id}`)
      try {
        const alreadyPosted = await hasJournalForSource('pos_order', id)
        if (!alreadyPosted) {
          await postPosOrderJournal({
            posOrderId: id,
            salesDate,
            total,
            vatAmount: vat,
            serviceAmount: Number(prev?.service_amt || 0),
            paymentCash: Number(prev?.payment_cash || 0),
            paymentCard: Number(prev?.payment_card || 0),
            paymentQr: Number(prev?.payment_qr || 0),
            paymentOther: Number(prev?.payment_other || 0),
            paymentDeliveryApp: Number(prev?.payment_delivery_app || 0),
            storeName: storeCode || undefined,
            memo: 'POS 주문 완료 자동분개',
          })
        }
      } catch (postingErr) {
        pushFailedStep(failedSideEffects, 'journal')
        console.error('updatePosOrderStatus posting:', postingErr)
      }
      try {
        await upsertPosVatLedgerDraft({
          posOrderId: id,
          orderNo,
          storeCode,
          createdAtIso: String(prev?.created_at ?? ''),
          subtotal,
          total,
          vatAmount: vat,
          createdBy: String(prev?.created_by ?? ''),
        })
      } catch (vatErr) {
        pushFailedStep(failedSideEffects, 'vat_draft')
        console.error('updatePosOrderStatus vat draft:', vatErr)
      }
      try {
        await enqueueKitchenPrintJob({
          storeCode,
          orderId: id,
          orderNo: String(prev?.order_no || `POS-${id}`),
          source: fromOfflineQueueSync ? 'offline_queue' : 'updatePosOrderStatus',
          dedupeKey: `order:${id}:kitchen:auto`,
          payload: {
            action: 'update_status',
            status: nextStatus,
          },
        })
      } catch (queueErr) {
        console.error('updatePosOrderStatus enqueueKitchenPrintJob:', queueErr)
      }
    } else if (isPosReversalStatus(nextStatus) && isPosPaidLikeStatus(prevStatus)) {
      try {
        await reversePosStockDeduction(id)
      } catch (e) {
        pushFailedStep(failedSideEffects, 'reversal_stock')
        console.error('reversePosStockDeduction:', e)
      }
      try {
        await postPosOrderReversalJournal({
          posOrderId: id,
          salesDate,
          storeName: storeCode || undefined,
          memo: `POS 주문 ${nextStatus === 'refunded' ? '환불' : '취소'} 역분개`,
        })
      } catch (postingErr) {
        pushFailedStep(failedSideEffects, 'reversal_journal')
        console.error('updatePosOrderStatus reversal posting:', postingErr)
      }
    }

    if (failedSideEffects.length > 0) {
      return NextResponse.json(
        {
          success: false,
          statusAlreadyApplied: true,
          retryAfterQueue: true,
          failedSideEffects,
          message: '주문 상태는 변경됐지만 후속 처리 일부가 실패했습니다. 재시도해 주세요.',
        },
        { headers }
      )
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('updatePosOrderStatus:', e)
    const msg = e instanceof Error ? e.message : String(e)
    /**
     * 예전에는 503을 썼지만, 브라우저·Vercel 로그에서 "서비스 불가"로 오인되고,
     * 오프라인 큐(sync.ts)는 JSON message 대신 raw 텍스트로만 남는 경우가 있었음.
     * HTTP 200 + success:false 로 통일해 실제 원인(Supabase 오류 등)이 message로 전달되게 함.
     */
    return NextResponse.json(
      {
        success: false,
        message: msg.slice(0, 500),
        /** 첫 요청(apiFetchWithOffline)에서 구 503처럼 큐 재적재 허용 */
        retryAfterQueue: true,
      },
      { headers }
    )
  }
}
