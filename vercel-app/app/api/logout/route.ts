import { NextResponse } from 'next/server'
import { buildClearAuthCookieHeader } from '@/lib/auth-cookie'

/** sessionStorage 정리는 클라이언트에서 하고, HttpOnly 쿠키만 서버에서 삭제 */
export async function POST() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.append('Set-Cookie', buildClearAuthCookieHeader())
  return NextResponse.json({ success: true }, { headers })
}

export async function OPTIONS() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')
  return new NextResponse(null, { status: 204, headers })
}
