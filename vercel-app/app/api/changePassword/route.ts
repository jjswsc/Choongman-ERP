import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseUpdate } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = await req.json()
    const store = String(body.store || '').trim()
    const name = String(body.name || '').trim()
    const oldPw = String(body.oldPw || '').trim()
    const newPw = String(body.newPw || '').trim()

    if (!newPw) {
      return NextResponse.json({ success: false, message: '새 비밀번호를 입력하세요.' }, { headers })
    }

    const filter = `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`
    const rows = (await supabaseSelectFilter('employees', filter)) as {
      id?: string | number
      store?: string
      name?: string
      password?: string
    }[]
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, message: '일치하는 계정을 찾을 수 없습니다.' }, { headers })
    }

    const row = rows[0]
    if (String(row.password || '').trim() !== oldPw) {
      return NextResponse.json({ success: false, message: '현재 비밀번호가 일치하지 않습니다.' }, { headers })
    }

    if (row.id == null) {
      return NextResponse.json({ success: false, message: '계정 정보를 찾을 수 없습니다.' }, { headers })
    }

    await supabaseUpdate('employees', row.id, { password: newPw })
    return NextResponse.json(
      { success: true, message: '비밀번호가 변경되었습니다. 다시 로그인해 주세요.' },
      { headers }
    )
  } catch (e) {
    console.error('changePassword:', e)
    return NextResponse.json(
      { success: false, message: '처리 중 오류가 발생했습니다.' },
      { headers }
    )
  }
}
