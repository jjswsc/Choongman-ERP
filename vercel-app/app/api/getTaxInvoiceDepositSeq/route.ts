import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { resolveTaxInvoiceDepositSeq } from '@/lib/tax-invoice-deposit-seq-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  const authResult = await requireAuth(request, 'manager')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  const { searchParams } = new URL(request.url)
  const accrualId = Number(searchParams.get('accrualId') || searchParams.get('accrual_id') || 0)
  const refId = Number(searchParams.get('refId') || searchParams.get('ref_id') || 0)
  const refType = String(searchParams.get('refType') || searchParams.get('ref_type') || '').trim()
  const existingDocumentNo = String(
    searchParams.get('existingDocumentNo') || searchParams.get('existing_document_no') || ''
  ).trim()
  const issueDate = String(searchParams.get('issueDate') || searchParams.get('issue_date') || '')
    .trim()
    .slice(0, 10)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    return NextResponse.json({ success: false, message: 'issueDate(YYYY-MM-DD)가 필요합니다.' }, { status: 400, headers })
  }
  if (!(accrualId > 0 || (refType && refId > 0))) {
    return NextResponse.json(
      { success: false, message: 'accrualId 또는 refType+refId가 필요합니다.' },
      { status: 400, headers }
    )
  }

  try {
    const seq = await resolveTaxInvoiceDepositSeq({
      issueDate,
      accrualId: accrualId > 0 ? accrualId : undefined,
      refType: refType || undefined,
      refId: refId > 0 ? refId : undefined,
      existingDocumentNo: existingDocumentNo || undefined,
    })
    return NextResponse.json({ success: true, seq }, { headers })
  } catch (e) {
    console.error('getTaxInvoiceDepositSeq:', e)
    return NextResponse.json({ success: false, message: '순번 조회에 실패했습니다.' }, { status: 500, headers })
  }
}
