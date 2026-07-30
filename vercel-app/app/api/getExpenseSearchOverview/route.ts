import { NextRequest, NextResponse } from 'next/server'
import { buildExpenseSearchOverview } from '@/lib/expense-search-overview'
import { isAccountingRole, isFranchiseeRole, isManagerRole, isOfficeRole } from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'

function canViewExpenseSearch(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role) || isManagerRole(role) || isFranchiseeRole(role)
}

function callerSeesAllAccrualStores(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(request, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const { searchParams } = new URL(request.url)
    const startStr = String(searchParams.get('startStr') || '').slice(0, 10)
    const endStr = String(searchParams.get('endStr') || '').slice(0, 10)
    const storeFilter = String(searchParams.get('storeFilter') || '').trim()
    const accountId = String(searchParams.get('accountId') || '').trim()
    const categoryFilter = String(searchParams.get('category') || '').trim().toLowerCase()
    const vendorFilter = String(searchParams.get('vendorFilter') || '').trim()
    const documentNoFilter = String(
      searchParams.get('documentNo') || searchParams.get('documentNoFilter') || ''
    ).trim()

    const userRole = String(auth.role || '').trim()
    if (!canViewExpenseSearch(userRole)) {
      return NextResponse.json(
        { list: [], summary: { planOnly: 0, approvedUnpaid: 0, paid: 0, bankOnly: 0, rejected: 0 } },
        { headers }
      )
    }

    const callerStore = String(auth.store || '').trim()
    const allowedStores = (Array.isArray(auth.allowedStores) ? auth.allowedStores : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .concat(callerStore)
    const canSeeAllStores = callerSeesAllAccrualStores(userRole)
    const scopedAllowedStores = canSeeAllStores ? [] : allowedStores

    const result = await buildExpenseSearchOverview({
      startStr,
      endStr,
      storeFilter: storeFilter && storeFilter !== '__all__' ? storeFilter : '',
      accountId: accountId && accountId !== '__all__' ? accountId : '',
      categoryFilter,
      vendorFilter,
      documentNoFilter,
      scopedAllowedStores,
    })

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('getExpenseSearchOverview:', e)
    return NextResponse.json(
      { list: [], summary: { planOnly: 0, approvedUnpaid: 0, paid: 0, bankOnly: 0, rejected: 0 } },
      { headers }
    )
  }
}
