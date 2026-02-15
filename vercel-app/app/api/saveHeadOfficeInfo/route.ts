import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'

const HQ_CODE = 'HQ' // 본사 전용 code (vendors_code_key unique 제약 회피)

/** 본사 정보 저장 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const companyName = String(body.companyName || '').trim() || '본사'
    const taxId = String(body.taxId || '').trim()
    const address = String(body.address || '').trim()
    const phone = String(body.phone || '').trim()
    const bankInfo = String(body.bankInfo || '').trim()

    let existing = (await supabaseSelectFilter('vendors', `code=eq.${encodeURIComponent(HQ_CODE)}`, { limit: 1 })) as { id?: number }[]
    if (!existing || existing.length === 0) {
      existing = (await supabaseSelectFilter('vendors', 'type=eq.본사', { limit: 1 })) as typeof existing
    }
    if (!existing || existing.length === 0) {
      existing = (await supabaseSelectFilter('vendors', 'type=eq.Head Office', { limit: 1 })) as typeof existing
    }

    const payload = {
      type: '본사',
      code: HQ_CODE,
      name: companyName,
      tax_id: taxId,
      addr: address,
      phone,
      memo: bankInfo,
    }

    if (existing && existing.length > 0 && existing[0].id != null) {
      await supabaseUpdate('vendors', existing[0].id, payload)
      return NextResponse.json({ success: true, message: '본사 정보가 수정되었습니다.' })
    }
    await supabaseInsert('vendors', payload)
    return NextResponse.json({ success: true, message: '본사 정보가 등록되었습니다.' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('saveHeadOfficeInfo:', msg)
    return NextResponse.json({ success: false, message: '저장 실패: ' + msg }, { status: 500 })
  }
}
