/**
 * 채널 확인 — KBank QR(PromptPay) 당일 POS payment_qr vs 매장 통장 계정과목 4130.
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
  aggregateKbankQrReconcileRows,
  aggregateQrBankDeposits,
  applyQrBankDepositsToRows,
  buildKbankQrReconcileResult,
  type KbankQrReconcileOrderRow,
} from '@/lib/pos-kbank-qr-reconcile'
import { bankDepositQueryTransDateWindow } from '@/lib/pos-delivery-app-bank-deposit'
import {
  CHANNEL_BANK_GL_CODES,
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
        queryLabel: 'posKbankQrReconcile',
      }),
      fetchStoreAccountDeposits({
        tenantScope,
        storeCodes: stores,
        startStr,
        endStr,
        transDateWindow: bankDepositQueryTransDateWindow(startStr, endStr),
        glCodes: [CHANNEL_BANK_GL_CODES.qr],
        queryLabel: 'posKbankQrReconcile.bankDeposits',
      }),
    ])

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

    const aggregated = aggregateKbankQrReconcileRows(rows as KbankQrReconcileOrderRow[], {
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

    const bankAgg = aggregateQrBankDeposits({
      rows: ledgerRows.map(ledgerRowToBankDepositInput),
      startStr,
      endStr,
      storeCodes: stores,
    })
    const withBank = applyQrBankDepositsToRows(aggregated, bankAgg)
    const result = buildKbankQrReconcileResult(withBank)
    return NextResponse.json({ success: true, ...result, truncated }, { headers })
  } catch (e) {
    console.error('posKbankQrReconcile:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : 'pos_kbank_qr_reconcile_error',
        rows: [],
        kpi: { orderCount: 0, qrSales: 0, bankDepositAmt: 0, storeCount: 0 },
      },
      { status: 500, headers }
    )
  }
}
