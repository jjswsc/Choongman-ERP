import { NextRequest, NextResponse } from 'next/server'
import { saveCardBillAllocation } from '@/lib/card-bill-allocation-server'
import { requireAuth } from '@/lib/verify-auth'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  const authResult = await requireAuth(request, 'office')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    authResult.errorResponse.headers.set('Content-Type', 'application/json')
    return authResult.errorResponse
  }

  try {
    const body = await request.json()
    const userName = String(authResult.auth.name || body.userName || body.user_name || '').trim()
    const parentId = Number(body.parentId ?? body.parent_id ?? 0)
    const lines = Array.isArray(body.lines) ? body.lines : []

    const result = await saveCardBillAllocation({
      parentId,
      lines: lines.map((l: Record<string, unknown>) => ({
        id: l.id != null ? Number(l.id) : undefined,
        accountSubjectId: Number(l.accountSubjectId ?? l.account_subject_id ?? 0),
        amount: Number(l.amount ?? 0),
        memo: l.memo != null ? String(l.memo || '') : undefined,
        vatAmount: l.vatAmount != null || l.vat_amount != null
          ? Number(l.vatAmount ?? l.vat_amount ?? 0)
          : undefined,
        invoiceReceived:
          typeof l.invoiceReceived === 'boolean'
            ? l.invoiceReceived
            : typeof l.invoice_received === 'boolean'
              ? l.invoice_received
              : undefined,
        invoiceNo:
          l.invoiceNo != null || l.invoice_no != null
            ? String(l.invoiceNo ?? l.invoice_no ?? '')
            : undefined,
        vendorCode:
          l.vendorCode != null || l.vendor_code != null
            ? String(l.vendorCode ?? l.vendor_code ?? '')
            : undefined,
      })),
      postedBy: userName || null,
    })

    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.status || 400, headers })
    }

    return NextResponse.json({ success: true, message: '계정별 배분이 저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveCardBillAllocation:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { status: 500, headers }
    )
  }
}
