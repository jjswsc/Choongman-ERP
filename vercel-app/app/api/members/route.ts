import { NextRequest, NextResponse } from 'next/server'
import { createMember, listMembers } from '@/lib/members-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'any')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q') || ''
    const limit = Number(searchParams.get('limit') || 100)
    const rows = await listMembers({ q, limit })
    return NextResponse.json(rows, { headers })
  } catch (e) {
    console.error('GET /api/members:', e)
    return NextResponse.json([], { headers })
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers({ 'Access-Control-Allow-Origin': '*' })
  const authRes = await requireAuth(req, 'any')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const body = (await req.json()) as {
      name?: string
      phone?: string
      email?: string
      source?: string
      lineUserId?: string
      lineDisplayName?: string
      linePictureUrl?: string
    }
    const member = await createMember({
      name: String(body.name || '').trim(),
      phone: String(body.phone || '').trim(),
      email: String(body.email || '').trim(),
      source: String(body.source || '').trim() || 'manual',
      lineUserId: String(body.lineUserId || '').trim(),
      lineDisplayName: String(body.lineDisplayName || '').trim(),
      linePictureUrl: String(body.linePictureUrl || '').trim(),
    })
    return NextResponse.json({ success: true, member }, { headers })
  } catch (e) {
    console.error('POST /api/members:', e)
    return NextResponse.json(
      {
        success: false,
        message: e instanceof Error ? e.message : '회원 저장에 실패했습니다.',
      },
      { headers }
    )
  }
}
