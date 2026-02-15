/**
 * vendors_rows.csv → Supabase vendors upsert
 * POST body: { csv: string } 또는 FormData (file)
 *
 * CSV 컬럼: id, Type, Code, Business partners, Tax ID, Address, Contact Name, Tel., Mail, manager, Name, balance, memo, created_at, gps_name, lat, lng
 * vendors 스키마: type, code, name, tax_id, ceo, addr, manager, phone, balance, memo, gps_name, lat, lng
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'

/** RFC 4180: 따옴표 안의 줄바꿈, "" 처리 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (c === '"') {
        if (next === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        row.push(field)
        field = ''
      } else if (c === '\n' || c === '\r') {
        row.push(field)
        field = ''
        if (row.some((x) => x !== '')) rows.push(row)
        row = []
        if (c === '\r' && next === '\n') i++
      } else {
        field += c
      }
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.some((x) => x !== '')) rows.push(row)
  }
  return rows
}

function mapType(type: string): 'purchase' | 'sales' {
  const t = String(type || '').toLowerCase().trim()
  if (t === 'customer' || t === 'sales' || t === '매출' || t === '매출처') return 'sales'
  return 'purchase'
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    let csvText = ''
    const ct = request.headers.get('content-type') || ''
    if (ct.includes('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('file') as File | null
      if (!file) {
        return NextResponse.json({ success: false, message: 'file 필드가 없습니다.' }, { headers })
      }
      csvText = await file.text()
    } else {
      const body = (await request.json()) as { csv?: string }
      csvText = String(body.csv || '')
    }
    if (!csvText.trim()) {
      return NextResponse.json({ success: false, message: 'CSV 내용이 비어 있습니다.' }, { headers })
    }

    const rows = parseCsv(csvText)
    if (rows.length < 2) {
      return NextResponse.json({ success: false, message: '헤더 외 데이터가 없습니다.' }, { headers })
    }

    const header = rows[0].map((h) => h.trim().toLowerCase())
    const idx = (name: string) => {
      const i = header.indexOf(name.toLowerCase())
      return i >= 0 ? i : -1
    }
    const col = {
      type: idx('type'),
      code: idx('code'),
      businessPartners: idx('business partners'),
      taxId: idx('tax id'),
      address: idx('address'),
      contactName: idx('contact name'),
      tel: idx('tel.'),
      mail: idx('mail'),
      manager: idx('manager'),
      name: idx('name'),
      balance: idx('balance'),
      memo: idx('memo'),
      gpsName: idx('gps_name'),
      lat: idx('lat'),
      lng: idx('lng'),
    }
    if (col.code < 0 || col.businessPartners < 0) {
      return NextResponse.json({ success: false, message: '필수 컬럼 Code 또는 Business partners가 없습니다.' }, { headers })
    }

    const vendors: Record<string, unknown>[] = []
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      const code = String(r[col.code] ?? '').trim()
      const name = String(r[col.businessPartners] ?? '').trim()
      if (!code || !name) continue

      const type = mapType(col.type >= 0 ? r[col.type] : '')
      const taxId = col.taxId >= 0 ? String(r[col.taxId] ?? '').trim().replace(/^'|'$/g, '') : ''
      const addr = col.address >= 0 ? String(r[col.address] ?? '').trim() : ''
      const manager = col.contactName >= 0 ? String(r[col.contactName] ?? '').trim() : ''
      const phone = col.tel >= 0 ? String(r[col.tel] ?? '').trim() : ''
      let memo = col.memo >= 0 ? String(r[col.memo] ?? '').trim() : ''
      const mail = col.mail >= 0 ? String(r[col.mail] ?? '').trim() : ''
      if (mail && !memo.includes(mail)) memo = memo ? `${memo}\n${mail}` : mail

      let gpsName = col.gpsName >= 0 ? String(r[col.gpsName] ?? '').trim() : ''
      if (!gpsName && col.name >= 0 && type === 'sales') {
        const shortName = String(r[col.name] ?? '').trim()
        if (shortName && !/^\d+$/.test(shortName)) gpsName = shortName
      }
      let lat: string | null = null
      let lng: string | null = null
      if (col.lat >= 0) {
        const v = String(r[col.lat] ?? '').trim()
        const n = parseFloat(v)
        if (v && !Number.isNaN(n)) lat = String(n)
      }
      if (col.lng >= 0) {
        const v = String(r[col.lng] ?? '').trim()
        const n = parseFloat(v)
        if (v && !Number.isNaN(n)) lng = String(n)
      }
      let balance: number | null = null
      if (col.balance >= 0) {
        const v = String(r[col.balance] ?? '').trim()
        const n = parseFloat(v)
        if (v && !Number.isNaN(n)) balance = n
      }

      vendors.push({
        type,
        code,
        name,
        tax_id: taxId || null,
        ceo: null,
        addr,
        manager,
        phone,
        balance,
        memo,
        gps_name: gpsName || null,
        lat,
        lng,
      })
    }

    if (vendors.length === 0) {
      return NextResponse.json({ success: false, message: '유효한 행이 없습니다.' }, { headers })
    }

    await supabaseUpsert('vendors', vendors, 'code')
    return NextResponse.json(
      { success: true, message: `${vendors.length}건 upsert 완료`, count: vendors.length },
      { headers }
    )
  } catch (e) {
    console.error('importVendorsFromCsv:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '가져오기 실패' },
      { headers }
    )
  }
}
