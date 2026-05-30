import { NextRequest, NextResponse } from 'next/server'
import { addMemberNote, listMemberNotes } from '@/lib/member-crm-server'
import { requireAuth } from '@/lib/verify-auth'

export async function GET(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  const { searchParams } = new URL(req.url)
  const memberId = Number(searchParams.get('memberId') || 0)
  const limit = Number(searchParams.get('limit') || 100)
  const rows = await listMemberNotes(memberId, limit)
  return NextResponse.json({ success: true, rows })
}

export async function POST(req: NextRequest) {
  const authRes = await requireAuth(req, 'manager')
  if (authRes.errorResponse) return authRes.errorResponse
  try {
    const body = (await req.json()) as { memberId?: number; note?: string; tags?: string[] }
    await addMemberNote({
      memberId: Number(body.memberId || 0),
      note: String(body.note || ''),
      tags: Array.isArray(body.tags) ? body.tags : [],
      createdBy: authRes.auth?.name || '',
    })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '메모 저장 실패' },
      { status: 400 }
    )
  }
}

