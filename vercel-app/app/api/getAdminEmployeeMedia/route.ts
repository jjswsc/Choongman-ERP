import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/verify-auth'

export const dynamic = 'force-dynamic'

/** 직원 편집 시 photo·id_card_photo만 lazy load (목록 API 부하 절감) */
export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')

  try {
    const authResult = await requireAuth(req, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }

    const rowId = Number(new URL(req.url).searchParams.get('row') || 0)
    if (!Number.isFinite(rowId) || rowId <= 0) {
      return NextResponse.json({ photo: '', idCardPhoto: '' }, { status: 400, headers })
    }

    let photo = ''
    let idCardPhoto = ''
    try {
      const rows = (await supabaseSelectFilter('employees', `id=eq.${rowId}`, {
        limit: 1,
        select: 'photo,id_card_photo',
      })) as { photo?: unknown; id_card_photo?: unknown }[] | null
      const row = rows?.[0]
      photo = row?.photo != null && String(row.photo).trim() ? String(row.photo).trim() : ''
      idCardPhoto =
        row?.id_card_photo != null && String(row.id_card_photo).trim()
          ? String(row.id_card_photo).trim()
          : ''
    } catch {
      try {
        const rows = (await supabaseSelectFilter('employees', `id=eq.${rowId}`, {
          limit: 1,
          select: 'photo',
        })) as { photo?: unknown }[] | null
        const row = rows?.[0]
        photo = row?.photo != null && String(row.photo).trim() ? String(row.photo).trim() : ''
      } catch {
        /* id_card_photo 컬럼 없음 등 */
      }
    }

    return NextResponse.json({ photo, idCardPhoto }, { headers })
  } catch (e) {
    console.error('getAdminEmployeeMedia:', e)
    return NextResponse.json({ photo: '', idCardPhoto: '' }, { status: 500, headers })
  }
}
