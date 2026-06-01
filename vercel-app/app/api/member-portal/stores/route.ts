import { NextRequest, NextResponse } from 'next/server'
import { fetchErpStoresMaster } from '@/lib/erp-store-master'
import { memberPortalStoresFromMasters } from '@/lib/member-portal-stores'
import { requireMemberSession } from '@/lib/member-portal-session'

export async function GET(req: NextRequest) {
  const { error } = await requireMemberSession(req)
  if (error) return error

  try {
    const rows = await fetchErpStoresMaster()
    const stores = memberPortalStoresFromMasters(rows)
    return NextResponse.json({ success: true, stores })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '매장 목록을 불러오지 못했습니다.' },
      { status: 500 }
    )
  }
}
