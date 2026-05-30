import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import { requireMemberSession } from '@/lib/member-portal-session'
import { supabaseInsert, supabaseSelectFilter } from '@/lib/supabase-server'

type MemberNoteRow = {
  id?: number
  member_id?: number
  note?: string | null
  tags?: string[] | null
  created_by?: string | null
  created_at?: string | null
}

function readFavoriteStoreCode(rows: MemberNoteRow[]): string {
  for (const row of rows || []) {
    const note = String(row.note || '').trim()
    if (!note) continue
    try {
      const j = JSON.parse(note) as { type?: string; storeCode?: string }
      if (String(j.type || '') === 'favorite_store' && String(j.storeCode || '').trim()) {
        return String(j.storeCode || '').trim()
      }
    } catch {
      continue
    }
  }
  return ''
}

export async function GET(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  try {
    const rows = (await supabaseSelectFilter(
      'member_notes',
      `member_id=eq.${Number(member!.id)}&created_by=eq.${encodeURIComponent('member_portal_pref')}`,
      { order: 'id.desc', limit: 20 }
    )) as MemberNoteRow[]
    const favoriteStoreCode = readFavoriteStoreCode(rows)
    return NextResponse.json({ success: true, favoriteStoreCode })
  } catch {
    return NextResponse.json({ success: true, favoriteStoreCode: '' })
  }
}

export async function POST(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  try {
    const body = (await req.json()) as { storeCode?: string }
    const storeCode = String(body.storeCode || '').trim()
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode is required' }, { status: 400 })
    }
    await supabaseInsert('member_notes', {
      member_id: Number(member!.id),
      note: JSON.stringify({ type: 'favorite_store', storeCode }),
      tags: ['favorite_store'],
      created_by: 'member_portal_pref',
      created_at: getBangkokDateTimeString(),
    })
    return NextResponse.json({ success: true, favoriteStoreCode: storeCode })
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'failed to save favorite store' },
      { status: 500 }
    )
  }
}

