/**
 * items_rows.csv → Supabase items (기존 전체 삭제 후 새로 입력)
 * POST body: { csv: string } 또는 FormData (file)
 *
 * CSV 컬럼: id, code, category, name, spec, price, cost, image, vendor, tax, created_at
 * items 스키마: code, category, name, spec, price, cost, image, vendor, tax
 */
import { NextRequest, NextResponse } from 'next/server'
import {
  supabaseDeleteByFilter,
  supabaseInsertMany,
  supabaseSelect,
} from '@/lib/supabase-server'

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

function mapTax(tax: string): string {
  const t = String(tax || '').trim().toLowerCase()
  if (t === '면세' || t === 'exempt') return '면세'
  if (t === '영세율' || t === 'zero') return '영세율'
  return '과세'
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
      code: idx('code'),
      category: idx('category'),
      name: idx('name'),
      spec: idx('spec'),
      price: idx('price'),
      cost: idx('cost'),
      image: idx('image'),
      vendor: idx('vendor'),
      tax: idx('tax'),
    }
    if (col.code < 0 || col.name < 0) {
      return NextResponse.json({ success: false, message: '필수 컬럼 code 또는 name이 없습니다.' }, { headers })
    }

    const itemsMap = new Map<string, Record<string, unknown>>()
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      const code = String(r[col.code] ?? '').trim()
      const name = String(r[col.name] ?? '').trim()
      if (!code || !name) continue

      const category = col.category >= 0 ? String(r[col.category] ?? '').trim() : ''
      const spec = col.spec >= 0 ? String(r[col.spec] ?? '').trim() : ''
      const image = col.image >= 0 ? String(r[col.image] ?? '').trim() : ''
      const vendor = col.vendor >= 0 ? String(r[col.vendor] ?? '').trim() : ''
      const taxRaw = col.tax >= 0 ? String(r[col.tax] ?? '').trim() : ''
      const tax = mapTax(taxRaw)

      let price = 0
      if (col.price >= 0) {
        const v = String(r[col.price] ?? '').replace(/,/g, '').trim()
        const n = parseFloat(v)
        if (!Number.isNaN(n)) price = n
      }
      let cost = 0
      if (col.cost >= 0) {
        const v = String(r[col.cost] ?? '').replace(/,/g, '').trim()
        const n = parseFloat(v)
        if (!Number.isNaN(n)) cost = n
      }

      itemsMap.set(code, {
        code,
        category,
        name,
        spec,
        price,
        cost,
        image,
        vendor,
        tax,
      })
    }
    const items = Array.from(itemsMap.values())

    if (items.length === 0) {
      return NextResponse.json({ success: false, message: '유효한 행이 없습니다.' }, { headers })
    }

    // 기존 품목 전체 삭제 (id >= 0으로 모든 행 매칭)
    const existing = (await supabaseSelect('items', { limit: 1 })) as { id?: number }[] | null
    if (existing && existing.length > 0) {
      await supabaseDeleteByFilter('items', 'id=gte.0')
    }

    // 배치로 insert (한 번에 100건씩)
    const chunkSize = 100
    for (let j = 0; j < items.length; j += chunkSize) {
      const chunk = items.slice(j, j + chunkSize)
      await supabaseInsertMany('items', chunk)
    }

    return NextResponse.json(
      { success: true, message: `기존 삭제 후 ${items.length}건 등록 완료`, count: items.length },
      { headers }
    )
  } catch (e) {
    console.error('importItemsFromCsv:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '가져오기 실패' },
      { headers }
    )
  }
}
