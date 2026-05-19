import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'

/** 인테리어 업체 마스터 추가/수정 */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Content-Type', 'application/json')

  try {
    const body = await request.json()
    const id = body.id != null ? Number(body.id) : null
    const name = String(body.name ?? '').trim()
    const code = String(body.code ?? '').trim()
    const contactName = String(body.contactName ?? body.contact_name ?? '').trim()
    const phone = String(body.phone ?? '').trim()
    const email = String(body.email ?? '').trim()
    const address = String(body.address ?? '').trim()
    const specialty = String(body.specialty ?? '').trim()
    const memo = String(body.memo ?? '').trim()
    const isActive = body.isActive !== false && body.is_active !== false
    const sortOrder = Number(body.sortOrder ?? body.sort_order) || 0

    if (!name) {
      return NextResponse.json({ success: false, message: '업체명을 입력하세요.' }, { status: 400, headers })
    }

    const row = {
      name,
      code: code || null,
      contact_name: contactName || null,
      phone: phone || null,
      email: email || null,
      address: address || null,
      specialty: specialty || null,
      memo: memo || null,
      is_active: isActive,
      sort_order: sortOrder,
      updated_at: new Date().toISOString(),
    }

    if (id && !Number.isNaN(id)) {
      await supabaseUpdate('interior_vendor_directory', id, row)
      return NextResponse.json({ success: true, id, message: '수정되었습니다.' }, { headers })
    }

    const inserted = await supabaseInsert('interior_vendor_directory', {
      ...row,
      use_count: 0,
    })
    const insertedRow = Array.isArray(inserted) ? inserted[0] : inserted
    const newId = (insertedRow as { id?: number })?.id
    return NextResponse.json({ success: true, id: newId, message: '등록되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveInteriorVendorDirectory:', e)
    return NextResponse.json(
      { success: false, message: '오류: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
