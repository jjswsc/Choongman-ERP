import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import {
  resolveAndReserveTaxInvoiceDepositSeq,
  resolveTaxInvoiceDepositSeq,
} from '@/lib/tax-invoice-deposit-seq-server'
import { applyTaxInvoiceOverrideToReceivable } from '@/lib/receivable-payable'

function corsHeaders() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return headers
}

function parseParams(source: {
  get: (k: string) => string | null
}): {
  accrualId: number
  refId: number
  refType: string
  existingDocumentNo: string
  issueDate: string
  referenceNo: string
  dueDate: string
  reserve: boolean
} {
  return {
    accrualId: Number(source.get('accrualId') || source.get('accrual_id') || 0),
    refId: Number(source.get('refId') || source.get('ref_id') || 0),
    refType: String(source.get('refType') || source.get('ref_type') || '').trim(),
    existingDocumentNo: String(
      source.get('existingDocumentNo') || source.get('existing_document_no') || ''
    ).trim(),
    issueDate: String(source.get('issueDate') || source.get('issue_date') || '')
      .trim()
      .slice(0, 10),
    referenceNo: String(source.get('referenceNo') || source.get('reference_no') || '').trim(),
    dueDate: String(source.get('dueDate') || source.get('due_date') || '').trim().slice(0, 10),
    reserve:
      source.get('reserve') === '1' ||
      source.get('reserve') === 'true' ||
      source.get('reserve') === 'yes',
  }
}

function validate(params: ReturnType<typeof parseParams>) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.issueDate)) {
    return 'issueDate(YYYY-MM-DD)가 필요합니다.'
  }
  if (!(params.accrualId > 0 || (params.refType && params.refId > 0))) {
    return 'accrualId 또는 refType+refId가 필요합니다.'
  }
  return null
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}

export async function GET(request: NextRequest) {
  const headers = corsHeaders()

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  const params = parseParams(new URL(request.url).searchParams)
  const err = validate(params)
  if (err) {
    return NextResponse.json({ success: false, message: err }, { status: 400, headers })
  }

  try {
    if (params.reserve && params.refType && params.refId > 0) {
      const reserved = await resolveAndReserveTaxInvoiceDepositSeq({
        issueDate: params.issueDate,
        accrualId: params.accrualId > 0 ? params.accrualId : undefined,
        refType: params.refType,
        refId: params.refId,
        existingDocumentNo: params.existingDocumentNo || undefined,
        referenceNo: params.referenceNo || undefined,
        dueDate: params.dueDate || undefined,
      })
      try {
        await applyTaxInvoiceOverrideToReceivable({
          refType: params.refType,
          refId: params.refId,
          issueDate: params.issueDate,
        })
      } catch (syncErr) {
        console.error('applyTaxInvoiceOverrideToReceivable after GET reserve:', syncErr)
      }
      return NextResponse.json(
        { success: true, seq: reserved.seq, documentNo: reserved.documentNo },
        { headers }
      )
    }

    const seq = await resolveTaxInvoiceDepositSeq({
      issueDate: params.issueDate,
      accrualId: params.accrualId > 0 ? params.accrualId : undefined,
      refType: params.refType || undefined,
      refId: params.refId > 0 ? params.refId : undefined,
      existingDocumentNo: params.existingDocumentNo || undefined,
    })
    return NextResponse.json({ success: true, seq }, { headers })
  } catch (e) {
    console.error('getTaxInvoiceDepositSeq:', e)
    return NextResponse.json({ success: false, message: '순번 조회에 실패했습니다.' }, { status: 500, headers })
  }
}

/** POST — 순번 할당과 동시에 override 예약 (레이스 방지) */
export async function POST(request: NextRequest) {
  const headers = corsHeaders()

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    authResult.errorResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    authResult.errorResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type')
    return authResult.errorResponse
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const get = (k: string) => {
      const v = body[k] ?? body[k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)]
      return v == null ? null : String(v)
    }
    const params = parseParams({ get })
    // POST는 기본 reserve
    if (!params.reserve) params.reserve = true

    const err = validate(params)
    if (err) {
      return NextResponse.json({ success: false, message: err }, { status: 400, headers })
    }
    if (!params.refType || !(params.refId > 0)) {
      return NextResponse.json(
        { success: false, message: '예약에는 refType+refId가 필요합니다.' },
        { status: 400, headers }
      )
    }

    const reserved = await resolveAndReserveTaxInvoiceDepositSeq({
      issueDate: params.issueDate,
      accrualId: params.accrualId > 0 ? params.accrualId : undefined,
      refType: params.refType,
      refId: params.refId,
      existingDocumentNo: params.existingDocumentNo || undefined,
      referenceNo: params.referenceNo || undefined,
      dueDate: params.dueDate || undefined,
      shipTo: String(body.shipTo || body.ship_to || '').trim() || undefined,
    })
    try {
      await applyTaxInvoiceOverrideToReceivable({
        refType: params.refType,
        refId: params.refId,
        issueDate: params.issueDate,
      })
    } catch (syncErr) {
      console.error('applyTaxInvoiceOverrideToReceivable after POST reserve:', syncErr)
    }
    return NextResponse.json(
      { success: true, seq: reserved.seq, documentNo: reserved.documentNo },
      { headers }
    )
  } catch (e) {
    console.error('reserveTaxInvoiceDepositSeq:', e)
    return NextResponse.json({ success: false, message: '순번 예약에 실패했습니다.' }, { status: 500, headers })
  }
}
