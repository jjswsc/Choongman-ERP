import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpsert } from '@/lib/supabase-server'
import { posApiCorsHeaders, requirePosStoreWriteAuth } from '@/lib/pos-api-write-auth'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  resolveSaasTenantScope,
  saasTenantStoreConflictTarget,
  stampSaasTenantIdForUniqueKey,
} from '@/lib/saas-tenant-scope'

const CASH_ACTUAL_DENOM_KEYS = ['1000', '500', '100', '50', '20', '10', '5', '2', '1'] as const

/** 요청 본문의 권종 JSON → DB용. 알 수 없는 키 제거, 음수 제거. 전부 0이면 null */
function normalizeCashActualDenoms(raw: unknown): Record<string, number> | null {
  if (raw == null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const out: Record<string, number> = {}
  let anyNonZero = false
  for (const k of CASH_ACTUAL_DENOM_KEYS) {
    const v = o[k] ?? o[String(Number(k))]
    const parsed = Number(v)
    const n = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0
    out[k] = n
    if (n > 0) anyNonZero = true
  }
  return anyNonZero ? out : null
}

function numOrZero(v: unknown): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** POS 결산 저장 */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()

  try {
    let body: Record<string, unknown>
    try {
      body = (await req.json()) as Record<string, unknown>
    } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { headers })
    }
    const storeCode = String(body.storeCode ?? '').trim()
    const authGate = await requirePosStoreWriteAuth(req, storeCode, headers)
    if (!authGate.ok) return authGate.response
    const auth = authGate.auth
    const tenantScope = await resolveSaasTenantScope({
      auth: auth ? { tenantId: auth.tenantId, company: auth.company } : null,
      storeCode,
    })
    const tenantWriteErr = assertSaasTenantWritable(tenantScope, {
      tableHint: 'pos_settlements',
      label: 'POS 결산',
    })
    if (tenantWriteErr) {
      return NextResponse.json(
        { success: false, message: tenantWriteErr, retryAfterQueue: false },
        { status: 403, headers }
      )
    }

    const settleDate = String(body.settleDate ?? '').trim()
    const cashActual = body.cashActual != null ? numOrNull(body.cashActual) : null
    const cashAmt = numOrZero(body.cashAmt)
    const cardAmt = numOrZero(body.cardAmt)
    const cardBreakdown = body.cardBreakdown && typeof body.cardBreakdown === 'object' ? body.cardBreakdown : {}
    const qrAmt = numOrZero(body.qrAmt)
    const qrBreakdown = body.qrBreakdown && typeof body.qrBreakdown === 'object' ? body.qrBreakdown : {}
    const deliveryAppAmt = numOrZero(body.deliveryAppAmt)
    const deliveryAppBreakdown = body.deliveryAppBreakdown && typeof body.deliveryAppBreakdown === 'object' ? body.deliveryAppBreakdown : {}
    const dineInDeliveryAmt = numOrZero(body.dineInDeliveryAmt)
    const dineInDeliveryBreakdown =
      body.dineInDeliveryBreakdown && typeof body.dineInDeliveryBreakdown === 'object' ? body.dineInDeliveryBreakdown : {}
    const otherAmt = numOrZero(body.otherAmt)
    const otherBreakdown = body.otherBreakdown && typeof body.otherBreakdown === 'object' ? body.otherBreakdown : {}
    const memo = String(body.memo ?? '').trim()
    const closed = !!body.closed
    const cashActualDenoms = normalizeCashActualDenoms(body.cashActualDenoms)

    if (!settleDate) {
      return NextResponse.json({ success: false, message: '결산일을 입력하세요.' }, { headers })
    }
    const existingFilter = appendSaasTenantFilter(
      `store_code=eq.${encodeURIComponent(storeCode)}&settle_date=eq.${encodeURIComponent(settleDate)}`,
      tenantScope,
      'pos_settlements'
    )
    const existing = (await supabaseSelectFilter('pos_settlements', existingFilter, {
      limit: 1,
      select: 'closed',
    })) as { closed?: boolean }[] | null
    if (existing?.[0]?.closed) {
      return NextResponse.json(
        { success: false, message: '이미 마감 완료된 결산입니다. 재저장할 수 없습니다.' },
        { headers }
      )
    }

    const row = stampSaasTenantIdForUniqueKey(
      {
        store_code: storeCode,
        settle_date: settleDate,
        cash_actual: cashActual,
        cash_amt: cashAmt,
        card_amt: cardAmt,
        card_breakdown: cardBreakdown,
        qr_amt: qrAmt,
        qr_breakdown: qrBreakdown,
        delivery_app_amt: deliveryAppAmt,
        delivery_app_breakdown: deliveryAppBreakdown,
        dine_in_delivery_amt: dineInDeliveryAmt,
        dine_in_delivery_breakdown: dineInDeliveryBreakdown,
        other_amt: otherAmt,
        other_breakdown: otherBreakdown,
        memo,
        closed,
        cash_actual_denoms: cashActualDenoms,
        updated_at: new Date().toISOString(),
      },
      tenantScope
    )

    const conflict = saasTenantStoreConflictTarget(tenantScope, 'store_code,settle_date')
    try {
      await supabaseUpsert('pos_settlements', [row], conflict)
    } catch (firstErr) {
      const msg = firstErr instanceof Error ? firstErr.message : String(firstErr)
      const missingDenomCol =
        msg.includes('cash_actual_denoms') && (msg.includes('PGRST204') || msg.includes('Could not find'))
      if (missingDenomCol) {
        const { cash_actual_denoms: _omit, ...rowWithoutDenoms } = row
        try {
          await supabaseUpsert('pos_settlements', [rowWithoutDenoms], conflict)
        } catch (secondErr) {
          const msg2 = secondErr instanceof Error ? secondErr.message : String(secondErr)
          if (/on conflict|42P10|unique|tenant_id/i.test(msg2)) {
            const { tenant_id: _t, ...legacy } = rowWithoutDenoms
            await supabaseUpsert('pos_settlements', [legacy], 'store_code,settle_date')
          } else {
            throw secondErr
          }
        }
        console.warn(
          'savePosSettlement: DB에 cash_actual_denoms 없음 → 권종 제외 후 저장. sql/pos_settlements_cash_actual_denoms.sql 실행 권장'
        )
      } else if (/on conflict|42P10|unique|tenant_id/i.test(msg)) {
        const { tenant_id: _t, ...legacy } = row
        await supabaseUpsert('pos_settlements', [legacy], 'store_code,settle_date')
      } else {
        throw firstErr
      }
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('savePosSettlement:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      {
        success: false,
        message: msg.slice(0, 500),
        /** 클라이언트가 200+success:false 를 오프라인 큐로 위장 성공 처리하지 않도록 끈다 */
        retryAfterQueue: false,
      },
      { headers }
    )
  }
}
