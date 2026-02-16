import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { signToken } from '@/lib/jwt-auth'
import { verifyPassword } from '@/lib/password'
import { parseOr400, loginSchema } from '@/lib/api-validate'

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
    const rows = await supabaseSelectFilter('employees', filter) as { store?: string; name?: string; password?: string; role?: string }[]
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, message: 'Login Failed' }, { headers })
    }

    const row = rows[0]
    const storedPw = String(row.password || '').trim()
    const ok = await verifyPassword(pw, storedPw)
    if (!ok) {
      return NextResponse.json({ success: false, message: 'Login Failed' }, { headers })
    }

    let rawRole = String(row.role || '').toLowerCase().replace(/\./g, '')
    let finalRole = 'staff'
    if (rawRole.includes('director') || rawRole.includes('ceo') || rawRole.includes('대표')) finalRole = 'director'
    else if (rawRole.includes('officer') || rawRole.includes('총괄') || rawRole.includes('오피스')) finalRole = 'officer'
    else if (rawRole.includes('manager') || rawRole.includes('점장') || rawRole.includes('매니저')) finalRole = 'manager'

    const storeCol = String(row.store || '').trim()
    if ((storeCol === 'Office' || storeCol === '본사' || storeCol === '오피스' || storeCol.toLowerCase() === 'office') && finalRole !== 'director') {
      finalRole = 'officer'
    }

    if (isAdminPage && finalRole !== 'director' && finalRole !== 'officer' && finalRole !== 'manager') {
      return NextResponse.json({ success: false, message: '권한 없음' }, { headers })
    }

    const storeName = String(row.store || '').trim()
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
    return NextResponse.json({ success: false, message: 'Login Failed' }, { headers: new Headers({ 'Access-Control-Allow-Origin': '*' }) })
  }
}
