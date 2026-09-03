import { NextRequest, NextResponse } from 'next/server'
import { posApiCorsHeaders } from '@/lib/pos-api-write-auth'

/** 선주문 체크인 경로는 보류. 예약금은 posDepositReceive만 사용. */
export async function POST(req: NextRequest) {
  const headers = posApiCorsHeaders()
  void req
  return NextResponse.json(
    { success: false, message: 'deposit_use_receive_api' },
    { headers }
  )
}
