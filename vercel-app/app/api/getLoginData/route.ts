import { NextResponse } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

async function getLoginDataHandler() {
  const empList = await supabaseSelect('employees', { order: 'id.asc' })
  const userMap: Record<string, string[]> = {}
  for (let i = 0; i < (empList || []).length; i++) {
    const store = String((empList as { store?: string }[])[i].store || '').trim()
    const name = String((empList as { name?: string }[])[i].name || '').trim()
    if (store && name) {
      if (!userMap[store]) userMap[store] = []
      userMap[store].push(name)
    }
  }
  const vendorRows = await supabaseSelect('vendors', { order: 'id.asc' })
  const vendorList: string[] = []
  for (let v = 0; v < (vendorRows || []).length; v++) {
    const n = String((vendorRows as { name?: string }[])[v].name || '').trim()
    if (n) vendorList.push(n)
  }
  return { users: userMap, vendors: vendorList }
}

export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const data = await getLoginDataHandler()
    return NextResponse.json(data, { headers })
  } catch (e) {
    console.error('getLoginData:', e)
    return NextResponse.json({ users: {}, vendors: [] }, { headers })
  }
}
