/**
 * 채널 확인 — POS payment_card vs 매장 통장 계정과목 4120~4124.
 */
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import {
  resolvePosSalesStoresFromRequest,
  resolvePosSalesTenantScopeFromRequest,
} from '@/lib/pos-sales-request-scope'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_PAYMENT_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import { resolvePosBusinessHoursFromContext } from '@/lib/pos-business-day-server'
import { applyPosSalesCacheControl } from '@/lib/pos-sales-response-cache'
import {
  aggregateCardBankDeposits,
  aggregateCardReconcileRows,
  applyCardBankDepositsToRows,
  buildCardReconcileResult,
  type CardReconcileOrderRow,
} from '@/lib/pos-card-reconcile'
import { bankDepositQueryTransDateWindow } from '@/lib/pos-delivery-app-bank-deposit'
import {
  CARD_BANK_GL_CODES,
  fetchStoreAccountDeposits,
  ledgerRowToBankDepositInput,
} from '@/lib/pos-channel-bank-ledger'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  applyPosSalesCacheControl(headers, searchParams)

  try {
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const stores = await resolvePosSalesStoresFromRequest(
      request,
      resolveStoresFromParams(pos, searchParams.get('stores'))
    )

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const tenantScope = await resolvePosSalesTenantScopeFromRequest(request)
    const [{ rows, truncated, bizCtx }, ledgerRows] = await Promise.all([
      fetchPosSalesOrdersForBusinessRange({
        request,
        startStr,
        endStr,
        storeCodes: stores.length > 0 ? stores : undefined,
        select: POS_SALES_PAYMENT_ROW_SELECT,
        queryLabel: 'posCardReconcile',
      }),
      fetchStoreAccountDeposits({
        tenantScope,
        storeCodes: stores,
        startStr,
        endStr,
        transDateWindow: bankDepositQueryTransDateWindow(startStr, endStr),
        glCodes: [...CARD_BANK_GL_CODES],
        queryLabel: 'posCardReconcile.bankDeposits',
      }),
    ])

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

    const aggregated = aggregateCardReconcileRows(rows as CardReconcileOrderRow[], {
      businessDateForRow: (row) => {
        const raw = String(row.created_at ?? '').trim()
        if (!raw) return ''
        const d = new Date(
          raw.includes('T') || /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(' ', 'T')
        )
        if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10)
        const hours = resolvePosBusinessHoursFromContext(bizCtx, String(row.store_code ?? '').trim())
        return getPosBusinessDateStrFromConfig(d, hours)
      },
    })

    const bankAgg = aggregateCardBankDeposits({
      rows: ledgerRows.map(ledgerRowToBankDepositInput),
      startStr,
      endStr,
      storeCodes: stores,
    })
    const withBank = applyCardBankDepositsToRows(aggregated, bankAgg)
    const result = buildCardReconcileResult(withBank)
    return NextResponse.json({ success: true, ...result, truncated }, { headers })
  } catch (e) {
    console.error('posCardReconcile:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'pos_card_reconcile_error',
        rows: [],
        kpi: { orderCount: 0, cardSales: 0, bankDepositAmt: 0, storeCount: 0 },
      },
      { status: 500, headers }
    )
  }
}
