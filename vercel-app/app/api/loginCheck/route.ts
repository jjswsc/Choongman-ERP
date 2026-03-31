import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { signToken } from '@/lib/jwt-auth'
import { verifyPassword } from '@/lib/password'
import { parseOr400, loginSchema } from '@/lib/api-validate'
import { isOfficeStore } from '@/lib/permissions'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = await req.json()
    const validated = parseOr400(loginSchema, { ...body, isAdminPage: body.isAdminPage !== false }, headers)
    if (validated.errorResponse) return validated.errorResponse
    const { store, name, pw, isAdminPage } = validated.parsed

    const filter = `store=eq.${encodeURIComponent(store)}&name=eq.${encodeURIComponent(name)}`
    const rows = (await supabaseSelectFilter('employees', filter, { limit: 1, select: 'store,name,password,role,job,resign_date' })) as { store?: string; name?: string; password?: string; role?: string; job?: string; resign_date?: string | null }[]
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Login Failed' }, { headers })
    }

    const row = rows[0]
    const resignStr = row.resign_date ? String(row.resign_date).trim().slice(0, 10) : ''
    if (resignStr) {
      const todayStr = new Date().toISOString().slice(0, 10)
      if (todayStr > resignStr) {
        return NextResponse.json({ success: false, message: '퇴사된 계정은 사용할 수 없습니다.' }, { headers })
      }
    }
    const storedPw = String(row.password || '').trim()
    const ok = await verifyPassword(pw, storedPw)
    if (!ok) {
      return NextResponse.json({ success: false, message: 'Login Failed' }, { headers })
    }

    const storeName = String(row.store || '').trim()
    const empIsOfficeStore = isOfficeStore(storeName)
    const rawRole = String((row.role || row.job || '')).toLowerCase().replace(/\./g, '')
    let finalRole = 'staff'
    if (rawRole.includes('director') || rawRole.includes('ceo') || rawRole.includes('대표')) finalRole = 'director'
    else if (rawRole === 'hr' || rawRole.includes('인사') || /\bhr\b/.test(rawRole)) finalRole = 'hr'
    else if (rawRole.includes('officer') || rawRole.includes('총괄') || rawRole.includes('오피스')) finalRole = 'officer'
    else if (rawRole.includes('manager') || rawRole.includes('점장') || rawRole.includes('매니저')) finalRole = 'manager'
    else if (rawRole.includes('franchisee') || rawRole.includes('가맹') || rawRole.includes('점주')) finalRole = 'franchisee'
    else if (rawRole.includes('accounting') || rawRole.includes('회계')) finalRole = 'accounting'
    else if (empIsOfficeStore) finalRole = 'officer' // store=Office → Officer로 인식

    // 관리자 페이지: 본사·매장 관리·회계 등 허용 역할만. 일반 직원(staff)은 차단
    const adminAllowed = new Set(['director', 'officer', 'ceo', 'hr', 'manager', 'franchisee', 'accounting'])
    if (isAdminPage && !adminAllowed.has(finalRole)) {
      return NextResponse.json({ success: false, message: '관리자 권한이 없습니다.' }, { headers })
    }

    const userName = String(row.name || '').trim()
    const token = await signToken({ store: storeName, name: userName, role: finalRole })

    return NextResponse.json({
      success: true,
      storeName,
      userName,
      role: finalRole,
      token,
    }, { headers })
  } catch (e) {
    console.error('loginCheck:', e)
    return NextResponse.json(
      {
        success: false,
        message: '서버에 일시적으로 연결할 수 없습니다. 인터넷 상태를 확인하고 잠시 후 다시 시도해 주세요.',
      },
      { headers: new Headers({ 'Access-Control-Allow-Origin': '*' }) }
    )
  }
}
