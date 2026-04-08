/**
 * DB 없이 200만 반환 — navigator.onLine 거짓 false 보정용 경량 연결 확인
 */
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json(
    { ok: true },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  )
}
