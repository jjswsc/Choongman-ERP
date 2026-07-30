import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/verify-auth'
import { searchRdVatCompanies } from '@/lib/rd-vat-company-search'

/** กรมสรรพากร VAT 사업자 검색 (공개 SOAP) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  try {
    const { searchParams } = new URL(request.url)
    const tin = String(searchParams.get('tin') || searchParams.get('taxId') || '').trim()
    const name = String(searchParams.get('name') || searchParams.get('q') || '').trim()
    const list = await searchRdVatCompanies({ tin, name })
    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('searchRdVatCompany:', e)
    return NextResponse.json({ success: false, message, list: [] }, { status: 400, headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  const authResult = await requireAuth(request, 'any')
  if (authResult.errorResponse) {
    authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
    return authResult.errorResponse
  }

  try {
    const body = await request.json().catch(() => ({}))
    const tin = String(body.tin || body.taxId || body.tax_id || '').trim()
    const name = String(body.name || body.q || '').trim()
    const list = await searchRdVatCompanies({ tin, name })
    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('searchRdVatCompany:', e)
    return NextResponse.json({ success: false, message, list: [] }, { status: 400, headers })
  }
}
