import { NextRequest, NextResponse } from 'next/server'
import { getBangkokDateTimeString } from '@/lib/bangkok-time'
import {
  buildFavoriteStoresNote,
  readFavoriteStoreCodesFromMemberNotes,
  toggleFavoriteStoreCode,
} from '@/lib/member-portal-favorite-stores'
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

function favoriteStoreResponse(codes: string[]) {
  return {
    success: true,
    favoriteStoreCodes: codes,
    favoriteStoreCode: codes[0] || '',
  }
}

export async function GET(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  try {
    const rows = (await supabaseSelectFilter(
      'member_notes',
      `member_id=eq.${Number(member!.id)}&created_by=eq.${encodeURIComponent('member_portal_pref')}`,
      { order: 'id.desc', limit: 50 }
    )) as MemberNoteRow[]
    const favoriteStoreCodes = readFavoriteStoreCodesFromMemberNotes(rows)
    return NextResponse.json(favoriteStoreResponse(favoriteStoreCodes))
  } catch {
    return NextResponse.json(favoriteStoreResponse([]))
  }
}

export async function POST(req: NextRequest) {
  const { member, error } = await requireMemberSession(req)
  if (error) return error
  try {
    const body = (await req.json()) as { storeCode?: string; action?: string }
    const storeCode = String(body.storeCode || '').trim()
    if (!storeCode) {
      return NextResponse.json({ success: false, message: 'storeCode is required' }, { status: 400 })
    }

    const rows = (await supabaseSelectFilter(
      'member_notes',
      `member_id=eq.${Number(member!.id)}&created_by=eq.${encodeURIComponent('member_portal_pref')}`,
      { order: 'id.desc', limit: 50 }
    )) as MemberNoteRow[]
    const current = readFavoriteStoreCodesFromMemberNotes(rows)
    const action = String(body.action || 'toggle').trim().toLowerCase()
    const next =
      action === 'add'
        ? toggleFavoriteStoreCode(current, storeCode)
        : action === 'remove'
          ? current.filter((code) => code !== storeCode)
          : toggleFavoriteStoreCode(current, storeCode)

    await supabaseInsert('member_notes', {
      member_id: Number(member!.id),
      note: buildFavoriteStoresNote(next),
      tags: ['favorite_store'],
      created_by: 'member_portal_pref',
      created_at: getBangkokDateTimeString(),
    })
    return NextResponse.json(favoriteStoreResponse(next))
  } catch (e) {
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'failed to save favorite store' },
      { status: 500 }
    )
  }
}
