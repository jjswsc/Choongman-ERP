/**
 * Excel 원가 파일 → items 테이블에 코드가 없는 품목만 추가, 행 순서대로 sort_order 반영
 * POST FormData: file (Excel .xlsx)
 *
 * - 엑셀 행 순서대로 모든 품목(기존+신규)의 sort_order를 설정 → 관리 화면 정렬이 엑셀과 동일
 * - 코드가 DB에 없는 품목만 신규 등록
 */
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import {
  supabaseSelect,
  supabaseInsertMany,
  supabaseInsert,
  supabaseUpdateByFilter,
} from '@/lib/supabase-server'

/** 헤더에서 컬럼 인덱스 찾기 (한글/영어 모두 지원) */
function findCol(header: string[], ...names: string[]): number {
  const lower = header.map((h) => String(h || '').trim().toLowerCase())
  for (const n of names) {
    const i = lower.findIndex((h) => h === n.toLowerCase() || h.includes(n.toLowerCase()))
    if (i >= 0) return i
  }
  return -1
}

function mapTax(tax: string): string {
  const t = String(tax || '').trim().toLowerCase()
  if (t === '면세' || t === 'exempt') return '면세'
  if (t === '영세율' || t === 'zero') return '영세율'
  return '과세'
}

function parseNum(val: unknown): number {
  if (val == null) return 0
  const s = String(val).replace(/,/g, '').trim()
  const n = parseFloat(s)
  return Number.isNaN(n) ? 0 : n
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const form = await request.formData()
    const file = form.get('file') as File | null
    if (!file) {
      return NextResponse.json({ success: false, message: 'file 필드가 없습니다.' }, { headers })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
    const sheetName = wb.SheetNames[0] || ''
    const ws = wb.Sheets[sheetName]
    const data = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: false,
    }) as unknown[][]

    if (!data || data.length < 2) {
      return NextResponse.json({ success: false, message: '헤더 외 데이터가 없습니다.' }, { headers })
    }

    const headerRow = data[0] as string[]
    const header = headerRow.map((h) => String(h ?? '').trim())

    const col = {
      code: findCol(header, '코드', 'code', '품목코드', 'item code'),
      name: findCol(header, '품목명', 'name', '품목이름', '품목'),
      category: findCol(header, '카테고리', 'category', '분류'),
      spec: findCol(header, '규격', 'spec'),
      unit: findCol(header, '단위', 'unit'),
      cost: findCol(header, '원가', 'cost'),
      price: findCol(header, '가격', 'price', '판매가'),
      vendor: findCol(header, '거래처', 'vendor'),
      tax: findCol(header, '세금', 'tax', '과세'),
    }

    if (col.code < 0 || col.name < 0) {
      return NextResponse.json(
        { success: false, message: '필수 컬럼이 없습니다. 코드(또는 품목코드), 품목명(또는 name) 필요.' },
        { headers }
      )
    }

    // 엑셀에 나온 카테고리 순서(첫 등장 순) → item_categories.sort_order 반영
    const orderedCategoryNames: string[] = []
    const seenCategories = new Set<string>()
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as unknown[]
      const catRaw = col.category >= 0 ? String(row[col.category] ?? '').trim() : ''
      const cat = !catRaw ? '' : catRaw === '매장 전용' ? 'Store Only' : catRaw
      if (cat && !seenCategories.has(cat)) {
        seenCategories.add(cat)
        orderedCategoryNames.push(cat)
      }
    }
    const existingCats = (await supabaseSelect('item_categories', { select: 'id,name', limit: 500 })) as { id?: number; name?: string }[] | null
    const existingCatNames = new Set((existingCats || []).map((r) => String(r.name || '').trim()).filter(Boolean))
    for (let idx = 0; idx < orderedCategoryNames.length; idx++) {
      const name = orderedCategoryNames[idx]
      const sortOrder = idx
      try {
        if (existingCatNames.has(name)) {
          await supabaseUpdateByFilter('item_categories', `name=eq.${encodeURIComponent(name)}`, { sort_order: sortOrder })
        } else {
          await supabaseInsert('item_categories', { name, sort_order: sortOrder })
          existingCatNames.add(name)
        }
      } catch (_) {
        // 무시
      }
    }

    // 기존 품목 코드 조회
    const existing = (await supabaseSelect('items', {
      select: 'code',
      limit: 10000,
    })) as { code?: string }[] | null
    const existingCodes = new Set((existing || []).map((r) => String(r.code || '').trim()).filter(Boolean))

    const toInsert: Record<string, unknown>[] = []
    let sortOrderUpdated = 0
    for (let i = 1; i < data.length; i++) {
      const row = data[i] as unknown[]
      const code = col.code >= 0 ? String(row[col.code] ?? '').trim() : ''
      const name = col.name >= 0 ? String(row[col.name] ?? '').trim() : ''

      if (!code || !name) continue

      const sortOrder = i
      if (existingCodes.has(code)) {
        try {
          await supabaseUpdateByFilter('items', `code=eq.${encodeURIComponent(code)}`, { sort_order: sortOrder })
          sortOrderUpdated += 1
        } catch (_) {
          // 컬럼 없음 등 무시
        }
        continue
      }

      const category = col.category >= 0 ? String(row[col.category] ?? '').trim() : ''
      const spec = col.spec >= 0 ? String(row[col.spec] ?? '').trim() : ''
      const unit = col.unit >= 0 ? String(row[col.unit] ?? '').trim() : ''
      const cost = col.cost >= 0 ? parseNum(row[col.cost]) : 0
      const price = col.price >= 0 ? parseNum(row[col.price]) : 0
      const vendor = col.vendor >= 0 ? String(row[col.vendor] ?? '').trim() : ''
      const taxRaw = col.tax >= 0 ? String(row[col.tax] ?? '').trim() : ''
      const tax = mapTax(taxRaw)

      toInsert.push({
        code,
        name,
        category: category || null,
        vendor: vendor || '',
        outbound_location: '',
        spec: spec || '',
        unit: unit || '',
        price: price || 0,
        cost: cost || 0,
        image: '',
        description: null,
        tax,
        purchase_source: 'hq',
        sort_order: sortOrder,
      })
      existingCodes.add(code)
    }

    const chunkSize = 100
    for (let j = 0; j < toInsert.length; j += chunkSize) {
      const chunk = toInsert.slice(j, j + chunkSize)
      await supabaseInsertMany('items', chunk)
    }

    const added = toInsert.length
    const msg =
      added > 0 && sortOrderUpdated > 0
        ? `${added}건 신규 등록, 기존 ${sortOrderUpdated}건 정렬 순서 반영 완료`
        : added > 0
          ? `${added}건 신규 등록 완료`
          : sortOrderUpdated > 0
            ? `정렬 순서 ${sortOrderUpdated}건 반영 완료 (신규 없음)`
            : '추가할 신규 품목이 없습니다. (모든 코드가 이미 등록됨)'
    return NextResponse.json(
      { success: true, message: msg, added, sortOrderUpdated },
      { headers }
    )
  } catch (e) {
    console.error('importItemsFromExcel:', e)
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { success: false, message: msg || '엑셀 가져오기 실패' },
      { headers }
    )
  }
}
